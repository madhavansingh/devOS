import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { streamOllamaChat, buildExplainMessages } from "@/lib/ollama";
import {
  checkRateLimit,
  EXPLAIN_LIMIT,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { sanitizeChunkForPrompt } from "@/lib/sanitize";

/**
 * POST /api/ai/explain
 *
 * Generates a natural-language explanation of a single file.
 * Zero-shot — full file content is sent directly to the LLM without RAG retrieval.
 *
 * Security: File content is sanitized before injection into LLM prompt
 * to prevent prompt injection via malicious file contents.
 *
 * @see project-docs/API.md §4.1
 */

const MAX_CONTENT_LENGTH = 30_000; // ~30KB of code

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit check (Redis-backed)
  const userId = session.user.githubLogin;
  const rl = await checkRateLimit(userId, "explain", EXPLAIN_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Resets at ${new Date(rl.resetAt).toISOString()}` },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const body = await req.json();
  const { filePath, fileContent } = body as {
    filePath?: string;
    fileContent?: string;
  };

  if (!filePath || !fileContent) {
    return NextResponse.json(
      { error: "filePath and fileContent are required" },
      { status: 400 }
    );
  }

  // Truncate very large files to avoid overloading the context window
  const truncated =
    fileContent.length > MAX_CONTENT_LENGTH
      ? fileContent.slice(0, MAX_CONTENT_LENGTH) +
        "\n\n... [file truncated for context window]"
      : fileContent;

  // SECURITY: Sanitize file content before LLM injection
  const sanitized = sanitizeChunkForPrompt(truncated);

  const messages = buildExplainMessages(filePath, sanitized);
  const stream = streamOllamaChat(messages);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
      ...rateLimitHeaders(rl),
    },
  });
}
