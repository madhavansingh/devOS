import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  generateEmbedding,
  streamOllamaChat,
  buildChatMessages,
  applyTokenBudget,
  assessContextQuality,
  OllamaMessage,
} from "@/lib/ollama";
import {
  getRepository,
  hybridSearchChunks,
  matchChunks,
  upsertUser,
} from "@/lib/supabase";
import {
  checkRateLimit,
  CHAT_LIMIT,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { sanitizeChunksForPrompt } from "@/lib/sanitize";
import {
  getCachedEmbedding,
  setCachedEmbedding,
  getCachedUser,
  setCachedUser,
} from "@/lib/cache";

/**
 * POST /api/ai/chat
 *
 * RAG-powered conversational endpoint (v3 — Stabilized Retrieval).
 *
 * Pipeline:
 *  1. Embed user's query (nomic-embed-text, 768-dim)
 *  2. Hybrid retrieval (vector + keyword), with vector-only fallback
 *  3. Context quality validation — reject or flag low-quality context
 *  4. Token budget enforcement — prevent context overflow
 *  5. Build structured prompt with clean context formatting
 *  6. Stream AI response via Ollama
 *
 * v3 Changes (fixing quality degradation):
 *  - minSimilarity raised from 0.15 → 0.35 (reject noise)
 *  - finalTopK reduced from 10 → 8 (fewer, better chunks)
 *  - Context quality assessment with logging
 *  - Token budget guard (4000 tokens max context)
 *  - Vector-only fallback when hybrid returns poor results
 *  - Chunk deduplication (strip identical chunk_text)
 *
 * @see project-docs/API.md §4.2
 */

// ─── Retrieval Config ────────────────────────────────────────

const RETRIEVAL_CONFIG = {
  vectorTopK: 15,         // broad semantic recall
  keywordTopK: 10,        // exact term matching
  finalTopK: 8,           // after fusion + diversity (was 10 — tighter now)
  maxChunksPerFile: 3,    // diversity cap
  minSimilarity: 0.35,    // noise floor (was 0.15 — much stricter now)
  contextTokenBudget: 4000, // max tokens for context window
  minChunkLength: 40,     // min chars for a chunk to be included
} as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit check (Redis-backed)
  const userLogin = session.user.githubLogin;
  const rl = await checkRateLimit(userLogin, "chat", CHAT_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Resets at ${new Date(rl.resetAt).toISOString()}` },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const body = await req.json();
  const { query, owner, repo, branch, history = [] } = body as {
    query?: string;
    owner?: string;
    repo?: string;
    branch?: string;
    history?: OllamaMessage[];
  };

  if (!query || !owner || !repo || !branch) {
    return NextResponse.json(
      { error: "query, owner, repo, branch are required" },
      { status: 400 }
    );
  }

  try {
    // ── 1. Resolve user (cached to avoid DB write on every request) ──
    let user = await getCachedUser(userLogin);
    if (!user) {
      const dbUser = await upsertUser({
        github_id: userLogin,
        github_login: userLogin,
        email: session.user.email,
        avatar_url: session.user.image,
      });
      user = { id: dbUser.id };
      await setCachedUser(userLogin, user);
    }

    const repoRecord = await getRepository(user.id, owner, repo);

    if (!repoRecord?.indexed) {
      return new Response(
        "⚠️ This repository hasn't been indexed yet. Click **Index Repository** to enable chat.",
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...rateLimitHeaders(rl),
          },
        }
      );
    }

    // ── 2. Embed the user's query (cached for repeated questions) ──
    let queryEmbedding = await getCachedEmbedding(query);
    if (!queryEmbedding) {
      queryEmbedding = await generateEmbedding(query);
      await setCachedEmbedding(query, queryEmbedding);
    }

    // ── 3. Retrieval — hybrid with vector-only fallback ─────
    let chunks = await hybridSearchChunks(
      queryEmbedding,
      query,
      repoRecord.id,
      {
        vectorTopK: RETRIEVAL_CONFIG.vectorTopK,
        keywordTopK: RETRIEVAL_CONFIG.keywordTopK,
        finalTopK: RETRIEVAL_CONFIG.finalTopK,
        maxChunksPerFile: RETRIEVAL_CONFIG.maxChunksPerFile,
        minSimilarity: RETRIEVAL_CONFIG.minSimilarity,
      }
    );

    // Fallback: if hybrid returns too few results, try vector-only
    // with a slightly relaxed threshold. This handles cases where
    // keyword search is unavailable or polluting results.
    if (chunks.length < 2) {
      console.log(
        `[Chat] Hybrid returned ${chunks.length} chunks — falling back to vector-only`
      );
      const vectorOnly = await matchChunks(
        queryEmbedding,
        repoRecord.id,
        RETRIEVAL_CONFIG.vectorTopK
      );
      // Apply similarity and size filters manually
      chunks = vectorOnly
        .filter((c) => c.similarity >= 0.30 && c.chunk_text.length >= RETRIEVAL_CONFIG.minChunkLength)
        .slice(0, RETRIEVAL_CONFIG.finalTopK)
        .map((c) => ({
          ...c,
          score: c.similarity,
          vectorRank: 0,
          keywordRank: 0,
        }));
      console.log(`[Chat] Vector-only fallback returned ${chunks.length} chunks`);
    }

    if (chunks.length === 0) {
      return new Response(
        "I couldn't find relevant code snippets for your query in this repository. " +
          "Try rephrasing your question, or ask about a specific file or function name.",
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...rateLimitHeaders(rl),
          },
        }
      );
    }

    // ── 4. Context quality validation ───────────────────────
    let contextChunks = chunks.map((c) => ({
      file_path: c.file_path,
      chunk_text: c.chunk_text,
    }));

    // Remove duplicate chunk_text (can happen with RRF overlap)
    const seenTexts = new Set<string>();
    contextChunks = contextChunks.filter((c) => {
      const key = c.chunk_text.trim();
      if (seenTexts.has(key)) return false;
      seenTexts.add(key);
      return true;
    });

    // Remove tiny/empty chunks that add noise
    contextChunks = contextChunks.filter(
      (c) => c.chunk_text.trim().length >= RETRIEVAL_CONFIG.minChunkLength
    );

    // SECURITY: Sanitize retrieved code to prevent prompt injection
    contextChunks = sanitizeChunksForPrompt(contextChunks);

    // Assess quality and log diagnostics
    const quality = assessContextQuality(contextChunks);

    if (!quality.hasSubstantialContext) {
      console.warn(
        `[Chat] LOW QUALITY CONTEXT for query "${query.slice(0, 80)}": ` +
          `${quality.totalChunks} chunks, ${quality.totalTokens} tokens`
      );
      // Still proceed, but the model's system prompt will handle
      // indicating uncertainty when context is insufficient
    }

    // ── 5. Apply token budget — prevent context overflow ────
    contextChunks = applyTokenBudget(
      contextChunks,
      RETRIEVAL_CONFIG.contextTokenBudget
    );

    // ── 6. Build RAG prompt with clean formatting ───────────
    const messages = buildChatMessages(query, contextChunks, history);

    // Log final prompt stats for debugging
    const totalPromptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    console.log(
      `[Chat] Query: "${query.slice(0, 60)}" | ` +
        `context: ${contextChunks.length} chunks from ${quality.uniqueFiles} files | ` +
        `prompt: ~${Math.ceil(totalPromptChars / 4)} tokens`
    );

    // ── 7. Stream Ollama response ────────────────────────────
    const stream = streamOllamaChat(messages);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
        ...rateLimitHeaders(rl),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    console.error("[/api/ai/chat] Error:", message);

    const safeMessage = message.includes("ECONNREFUSED")
      ? "AI engine is offline. Please start Ollama."
      : message.includes("Supabase") || message.includes("Redis")
        ? "Service temporarily unavailable."
        : "Chat failed. Please try again.";

    const status = message.includes("ECONNREFUSED") ? 502 : 500;
    return NextResponse.json({ error: safeMessage }, { status });
  }
}
