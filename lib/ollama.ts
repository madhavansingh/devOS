import { serverEnv } from "@/lib/env";
import { withRetry, OLLAMA_CHAT_RETRY, OLLAMA_EMBED_RETRY } from "@/lib/retry";

/**
 * Ollama integration layer for DevOS.
 * Handles streaming chat, embeddings, and prompt construction.
 *
 * Models:
 *  - Chat:       auto-detected from available models (configurable via OLLAMA_MODEL)
 *  - Embeddings: nomic-embed-text (768-dim, configurable via OLLAMA_EMBED_MODEL)
 *
 * Endpoint strategy:
 *  - Probes /api/chat on first call; if unavailable, falls back to /api/generate.
 *  - Adapts request body and streaming parse format accordingly.
 *
 * @see project-docs/API.md §9.2 — Ollama Retry & Timeout
 */

const OLLAMA_BASE = serverEnv.OLLAMA_BASE_URL;
const CONFIGURED_CHAT_MODEL = serverEnv.OLLAMA_MODEL;
const EMBED_MODEL = serverEnv.OLLAMA_EMBED_MODEL;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type OllamaEndpoint = "/api/chat" | "/api/generate";

interface OllamaCapabilities {
  endpoint: OllamaEndpoint;
  model: string;
  detectedAt: number;
}

// ─────────────────────────────────────────────────────────────
// Capability Detection (cached, lazy)
// ─────────────────────────────────────────────────────────────

/** Cache capability probe results for 5 minutes to avoid repeated probes */
const CAPABILITY_TTL_MS = 5 * 60 * 1000;
let cachedCapabilities: OllamaCapabilities | null = null;

/**
 * Resolve the actual model name from available models.
 * Handles cases like configured "qwen2.5-coder" when the installed
 * model is "qwen2.5-coder:7b" (no :latest alias).
 */
async function resolveModelName(configured: string): Promise<string> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[Ollama] Failed to list models (HTTP ${res.status}), using configured: ${configured}`);
      return configured;
    }

    const data = await res.json();
    const models: Array<{ name: string }> = data.models ?? [];
    const modelNames = models.map((m) => m.name);

    console.log(`[Ollama] Available models: ${modelNames.join(", ") || "(none)"}`);

    // 1. Exact match
    if (modelNames.includes(configured)) return configured;

    // 2. Try with :latest suffix
    const withLatest = `${configured}:latest`;
    if (modelNames.includes(withLatest)) return withLatest;

    // 3. Prefix match: e.g. "qwen2.5-coder" matches "qwen2.5-coder:7b"
    const prefixMatch = modelNames.find((name) => name.startsWith(configured + ":"));
    if (prefixMatch) return prefixMatch;

    // 4. Fallback: use first available non-embedding model
    if (modelNames.length > 0) {
      const chatModel = modelNames.find(
        (n) => !n.includes("embed") && !n.includes("nomic")
      );
      if (chatModel) {
        console.warn(`[Ollama] Model "${configured}" not found. Falling back to: ${chatModel}`);
        return chatModel;
      }
    }

    console.error(
      `[Ollama] Model "${configured}" not found and no suitable fallback. Available: [${modelNames.join(", ")}]`
    );
    return configured;
  } catch (err) {
    console.warn(`[Ollama] Could not list models: ${err instanceof Error ? err.message : err}`);
    return configured;
  }
}

/**
 * Probe which chat endpoint Ollama supports and resolve the model name.
 * Tests /api/chat first; falls back to /api/generate.
 * Results are cached for CAPABILITY_TTL_MS.
 */
async function detectCapabilities(): Promise<OllamaCapabilities> {
  if (
    cachedCapabilities &&
    Date.now() - cachedCapabilities.detectedAt < CAPABILITY_TTL_MS
  ) {
    return cachedCapabilities;
  }

  const model = await resolveModelName(CONFIGURED_CHAT_MODEL);

  const chatOk = await probeEndpoint("/api/chat", {
    model,
    messages: [{ role: "user", content: "test" }],
    stream: false,
  });

  if (chatOk) {
    cachedCapabilities = { endpoint: "/api/chat", model, detectedAt: Date.now() };
    return cachedCapabilities;
  }

  const genOk = await probeEndpoint("/api/generate", {
    model,
    prompt: "test",
    stream: false,
  });

  if (genOk) {
    cachedCapabilities = { endpoint: "/api/generate", model, detectedAt: Date.now() };
    return cachedCapabilities;
  }

  console.error(
    `[Ollama] Neither /api/chat nor /api/generate responded for model "${model}". ` +
      `Check that Ollama is running at ${OLLAMA_BASE} and the model is pulled.`
  );
  cachedCapabilities = { endpoint: "/api/generate", model, detectedAt: Date.now() };
  return cachedCapabilities;
}

async function probeEndpoint(
  path: OllamaEndpoint,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${OLLAMA_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok) {
      try { await res.text(); } catch { /* ignore */ }
      return true;
    }

    const errBody = await res.text().catch(() => "");
    console.warn(`[Ollama] Probe ${path} -> HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    return false;
  } catch (err) {
    console.warn(`[Ollama] Probe ${path} failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

function invalidateCapabilityCache(): void {
  cachedCapabilities = null;
}

// ─────────────────────────────────────────────────────────────
// Streaming Chat
// ─────────────────────────────────────────────────────────────

function messagesToPrompt(messages: OllamaMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    switch (m.role) {
      case "system":
        parts.push(`[SYSTEM]\n${m.content}\n`);
        break;
      case "user":
        parts.push(`[USER]\n${m.content}\n`);
        break;
      case "assistant":
        parts.push(`[ASSISTANT]\n${m.content}\n`);
        break;
    }
  }
  parts.push("[ASSISTANT]\n");
  return parts.join("\n");
}

function extractStreamContent(
  json: Record<string, unknown>,
  endpoint: OllamaEndpoint
): string | null {
  if (endpoint === "/api/chat") {
    const msg = json.message as Record<string, unknown> | undefined;
    return typeof msg?.content === "string" ? msg.content : null;
  }
  return typeof json.response === "string" ? (json.response as string) : null;
}

/**
 * Stream a chat completion from Ollama.
 * Returns a ReadableStream suitable for piping to a Next.js Response.
 */
export function streamOllamaChat(messages: OllamaMessage[]): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const caps = await detectCapabilities();
        const { endpoint, model } = caps;

        const requestBody =
          endpoint === "/api/chat"
            ? { model, messages, stream: true }
            : { model, prompt: messagesToPrompt(messages), stream: true };

        console.log(
          `[Ollama] Streaming ${endpoint} | model: ${model} | messages: ${messages.length}`
        );

        const res = await withRetry(
          async (signal) => {
            const response = await fetch(`${OLLAMA_BASE}${endpoint}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
              signal,
            });

            if (!response.ok) {
              const errText = await response.text().catch(() => "");
              console.error(`[Ollama] ${endpoint} returned HTTP ${response.status}: ${errText.slice(0, 300)}`);
              if (response.status === 404) invalidateCapabilityCache();
              throw new Error(
                `Ollama ${endpoint} returned ${response.status}: ${errText.slice(0, 100) || "unknown error"}`
              );
            }

            return response;
          },
          OLLAMA_CHAT_RETRY
        );

        if (!res.body) {
          controller.enqueue(encoder.encode("Error: No response body from AI engine"));
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n").filter(Boolean)) {
            try {
              const json = JSON.parse(line) as Record<string, unknown>;
              const content = extractStreamContent(json, endpoint);
              if (content) {
                controller.enqueue(encoder.encode(content));
                chunkCount++;
              }
            } catch {
              // Malformed JSON chunk — skip silently
            }
          }
        }

        console.log(`[Ollama] Stream complete: ${chunkCount} chunks delivered`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ollama connection failed";
        console.error(`[Ollama] Stream error: ${msg}`);

        if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
          controller.enqueue(
            encoder.encode("\n\n⚠️ AI engine is offline. Please ensure Ollama is running.")
          );
        } else if (msg.includes("AbortError") || msg.includes("timeout")) {
          controller.enqueue(
            encoder.encode("\n\n⚠️ AI response timed out. Try a simpler question.")
          );
        } else if (msg.includes("404")) {
          invalidateCapabilityCache();
          controller.enqueue(
            encoder.encode(
              `\n\n⚠️ Model or endpoint not found. Check that the configured model is pulled in Ollama. Error: ${msg}`
            )
          );
        } else {
          controller.enqueue(encoder.encode(`\n\n⚠️ ${msg}`));
        }
      } finally {
        controller.close();
      }
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Embeddings
// ─────────────────────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[]> {
  const data = await withRetry(
    async (signal) => {
      const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[Ollama/Embed] HTTP ${res.status}: ${errText.slice(0, 200)}`);
        throw new Error(`Ollama embed API error: ${res.status}`);
      }

      return res.json();
    },
    OLLAMA_EMBED_RETRY
  );

  return data.embeddings?.[0] ?? data.embedding ?? [];
}

export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize = 5
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map(generateEmbedding));
    results.push(...embeddings);

    if (texts.length > 20 && (i + batchSize) % 50 === 0) {
      console.log(`[Embed] Progress: ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Prompts — v3: Balanced, Grounded, Anti-Hallucination
// ─────────────────────────────────────────────────────────────

/*
 * v3 Prompt Strategy (fixes quality degradation from v2):
 *
 * Problems in v2:
 *  - Over-restrictive: 7 negative rules caused template refusals
 *  - Double-wrapped context: chunk headers from indexing + decorator wrapping = noise
 *  - Heavy separators: box-drawing chars consumed tokens and confused local models
 *  - Repeated instructions: system prompt rules restated in query wrapper
 *
 * v3 Principles:
 *  1. POSITIVE framing — tell model what TO do, not 7 things NOT to do
 *  2. Clean context — strip indexing headers, one-level [File: path] labels only
 *  3. Token budget — cap context to prevent overflow on smaller models
 *  4. Single instruction — system prompt sets behavior, query does NOT repeat it
 *  5. Confidence signaling — allow "limited inferences" instead of binary found/not-found
 */

// ─── System Prompts ──────────────────────────────────────────

const EXPLAIN_SYSTEM_PROMPT = `You are a senior software engineer analyzing a real codebase.

Use the provided file content as the primary source of truth.

Guidelines:
- Base your analysis on actual code present in the file
- Reference specific function names, variables, and logic
- If something is unclear from the code alone, say so explicitly
- Do NOT invent functions, imports, or behaviors not present in the code
- Be precise and technical — prefer accuracy over verbosity

Response format:

### Summary
One sentence: what this file does and its role in the system.

### Key Exports & Functions
Bullet list of exported functions, classes, types, constants — with 1-line descriptions.

### Dependencies
What this file imports and why.

### How It Works
Core logic and data flow, referencing specific functions from the code.

### Important Notes
Edge cases, side effects, or non-obvious behavior. Omit if none.`;

const CHAT_SYSTEM_PROMPT = `You are a senior software engineer analyzing a real codebase.

Use the provided code context as the primary source of truth.

Guidelines:
- Base your answer on actual code when available
- Clearly reference file paths and logic from the provided snippets
- If context is incomplete, explain what is missing and make limited, reasonable inferences
- Do NOT invent specific functions, files, or implementations that are not present in the context
- Prefer accuracy and clarity over verbosity

Response format:

### Answer
1-2 sentence direct answer.

### Explanation
Detailed analysis grounded in the actual code. Reference specific functions, variables, and file paths from the provided context using inline code formatting.

### File References
- Bullet list of file paths referenced in your answer.

### Code Snippets
(Only if helpful) Short relevant excerpts from the provided context.`;

// ─── Context Formatters (v3 — clean, no double-wrapping) ─────

/**
 * Strip chunk indexing headers from stored text.
 * During indexing, chunks get headers like:
 *   [lib/ollama.ts :: chunk 3/12, lines 101-160]
 *   [lib/ollama.ts]
 * These are useful for embedding quality but should NOT appear
 * in the LLM prompt — they confuse the model and waste tokens.
 */
function stripChunkHeaders(text: string): string {
  // Remove indexing headers: [path :: chunk N/M, lines X-Y] or [path]
  return text
    .replace(/^\[.+?(?:\s*::\s*chunk\s+\d+\/\d+.*?)?\]\s*\n?/gm, "")
    .trim();
}

/**
 * Format a single file's content for the explain endpoint.
 * Clean format: [File: path] followed by fenced code block.
 */
function formatFileContext(filePath: string, content: string): string {
  const ext = filePath.split(".").pop() ?? "text";
  return `[File: ${filePath}]\n\`\`\`${ext}\n${content}\n\`\`\``;
}

/**
 * Format retrieved RAG chunks for the chat endpoint.
 *
 * Groups chunks by file path for clarity, strips indexing headers,
 * and uses a clean [File: path] label format.
 *
 * v3: Replaces the box-drawing decorator format that caused
 * double-wrapping and token waste.
 */
function formatContextChunks(
  chunks: Array<{ file_path: string; chunk_text: string }>
): string {
  if (chunks.length === 0) return "(no code context available)";

  // Group chunks by file for cleaner presentation
  const byFile = new Map<string, string[]>();
  for (const c of chunks) {
    const cleaned = stripChunkHeaders(c.chunk_text);
    if (!cleaned || cleaned.length < 20) continue;

    const existing = byFile.get(c.file_path) ?? [];
    existing.push(cleaned);
    byFile.set(c.file_path, existing);
  }

  const sections: string[] = [];
  for (const [filePath, codeBlocks] of byFile) {
    const ext = filePath.split(".").pop() ?? "text";
    const combined = codeBlocks.join("\n\n// ...\n\n");
    sections.push(`[File: ${filePath}]\n\`\`\`${ext}\n${combined}\n\`\`\``);
  }

  return sections.join("\n\n");
}

// ─── Token Budget ────────────────────────────────────────────

/** Rough token estimate: 1 token ≈ 4 characters */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Apply a token budget to context chunks.
 * Keeps high-priority chunks (front of array = highest relevance)
 * and drops trailing chunks that would exceed the budget.
 *
 * This prevents context overflow on smaller local models
 * (phi3: 4K context, llama3.2:1b: 4K, qwen2.5-coder:7b: 32K).
 */
export function applyTokenBudget(
  chunks: Array<{ file_path: string; chunk_text: string }>,
  maxTokens = 4000
): Array<{ file_path: string; chunk_text: string }> {
  let budget = maxTokens;
  const fitted: Array<{ file_path: string; chunk_text: string }> = [];

  for (const chunk of chunks) {
    const tokens = estimateTokens(chunk.chunk_text);
    if (tokens > budget) {
      // If this is the first chunk and it's oversized, include a truncated version
      if (fitted.length === 0) {
        const truncatedText = chunk.chunk_text.slice(0, maxTokens * 4);
        fitted.push({ ...chunk, chunk_text: truncatedText + "\n// ... [truncated]" });
      }
      break;
    }
    budget -= tokens;
    fitted.push(chunk);
  }

  if (fitted.length < chunks.length) {
    console.log(
      `[Context] Token budget: kept ${fitted.length}/${chunks.length} chunks (budget: ${maxTokens} tokens)`
    );
  }

  return fitted;
}

// ─── Context Quality Validation ──────────────────────────────

export interface ContextQuality {
  totalChunks: number;
  totalTokens: number;
  uniqueFiles: number;
  avgChunkSize: number;
  hasSubstantialContext: boolean;
}

/**
 * Validate the quality of retrieved context before sending to the model.
 * Logs diagnostic information and returns a quality assessment.
 */
export function assessContextQuality(
  chunks: Array<{ file_path: string; chunk_text: string }>
): ContextQuality {
  const totalTokens = chunks.reduce((sum, c) => sum + estimateTokens(c.chunk_text), 0);
  const uniqueFiles = new Set(chunks.map((c) => c.file_path)).size;
  const avgChunkSize = chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0;

  // Context is "substantial" if we have real code to work with
  const hasSubstantialContext =
    chunks.length >= 1 &&
    totalTokens >= 50 &&
    avgChunkSize >= 20;

  const quality: ContextQuality = {
    totalChunks: chunks.length,
    totalTokens,
    uniqueFiles,
    avgChunkSize,
    hasSubstantialContext,
  };

  console.log(
    `[Context Quality] chunks=${quality.totalChunks} tokens=${quality.totalTokens} ` +
      `files=${quality.uniqueFiles} avgSize=${quality.avgChunkSize} ` +
      `substantial=${quality.hasSubstantialContext}`
  );

  return quality;
}

// ─── Public Message Builders ─────────────────────────────────

/** Build messages for the File Explanation endpoint (zero-shot) */
export function buildExplainMessages(
  filePath: string,
  fileContent: string
): OllamaMessage[] {
  return [
    {
      role: "system",
      content: EXPLAIN_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: [
        `Analyze and explain this file: \`${filePath}\``,
        "",
        formatFileContext(filePath, fileContent),
      ].join("\n"),
    },
  ];
}

/** Build messages for the RAG Chat endpoint */
export function buildChatMessages(
  userQuery: string,
  contextChunks: Array<{ file_path: string; chunk_text: string }>,
  chatHistory: OllamaMessage[] = []
): OllamaMessage[] {
  const formattedContext = formatContextChunks(contextChunks);
  const fileList = [...new Set(contextChunks.map((c) => c.file_path))];

  return [
    {
      role: "system",
      content: [
        CHAT_SYSTEM_PROMPT,
        "",
        "---",
        "CODE CONTEXT (use this as your primary source):",
        "",
        `Files available: ${fileList.map((f) => `\`${f}\``).join(", ")}`,
        "",
        formattedContext,
        "",
        "---",
        "END OF CODE CONTEXT",
      ].join("\n"),
    },
    ...chatHistory.slice(-6),
    {
      role: "user",
      content: userQuery,
    },
  ];
}
