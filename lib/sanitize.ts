/**
 * Prompt injection protection for DevOS.
 *
 * Sanitizes retrieved code context before injecting into LLM prompts.
 * Prevents malicious repo content from hijacking the system prompt.
 *
 * Attack vectors blocked:
 *  - [SYSTEM] / [USER] / [ASSISTANT] role markers
 *  - Common prompt injection phrases
 *  - Delimiter escape attempts
 *  - Instruction override patterns
 */

// ─────────────────────────────────────────────────────────────
// Patterns that indicate prompt injection attempts
// ─────────────────────────────────────────────────────────────

/**
 * Role markers that could trick the LLM into treating code as instructions.
 * Matches both bracket and XML-style markers.
 */
const ROLE_MARKER_PATTERN =
  /\[(SYSTEM|USER|ASSISTANT|INST|\/INST)\]|<\/?(?:system|user|assistant|s|\/s)>/gi;

/**
 * Common prompt injection phrases found in adversarial inputs.
 * These are instructions disguised as code content.
 */
const INJECTION_PHRASES = [
  /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions/gi,
  /disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|rules|context)/gi,
  /you\s+are\s+now\s+(?:a|an|the)\s+/gi,
  /forget\s+(?:everything|all|your)\s+(?:previous|prior|above)/gi,
  /(?:new|updated|revised)\s+(?:system\s+)?instructions?\s*:/gi,
  /override\s+(?:system|safety|security)\s+(?:prompt|instructions|rules)/gi,
  /do\s+not\s+follow\s+(?:the|your)\s+(?:system|original|previous)\s+(?:prompt|instructions)/gi,
  /pretend\s+(?:you\s+are|to\s+be|that)/gi,
  /act\s+as\s+(?:if|though)\s+you/gi,
  /output\s+(?:the|your)\s+(?:system|initial|original)\s+(?:prompt|instructions)/gi,
  /reveal\s+(?:the|your)\s+(?:system|initial|original)\s+(?:prompt|instructions)/gi,
];

/**
 * Delimiter escape patterns — attempts to break out of context blocks.
 */
const DELIMITER_ESCAPE_PATTERN =
  /[═╔╚╗╝┌┐└┘]{3,}|={10,}|─{10,}|━{10,}/g;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Sanitize a chunk of retrieved code before including it in an LLM prompt.
 *
 * This does NOT modify the stored data — only the text sent to the LLM.
 * The original chunk_text in the database remains untouched.
 *
 * @param text - Raw chunk text from the database
 * @returns Sanitized text safe for prompt injection
 */
export function sanitizeChunkForPrompt(text: string): string {
  let sanitized = text;

  // 1. Replace role markers with safe alternatives
  sanitized = sanitized.replace(ROLE_MARKER_PATTERN, (match) => {
    // Replace brackets/tags but preserve the word for code readability
    const inner = match.replace(/[\[\]<>/]/g, "").trim();
    return `«${inner}»`;
  });

  // 2. Defang prompt injection phrases
  //    We don't remove them (could be legitimate code comments),
  //    but we wrap them to break the instruction pattern.
  for (const pattern of INJECTION_PHRASES) {
    sanitized = sanitized.replace(pattern, (match) => {
      return `[CODE_CONTENT: ${match}]`;
    });
  }

  // 3. Neutralize delimiter escape attempts
  //    Replace long runs of box-drawing/delimiter characters
  sanitized = sanitized.replace(DELIMITER_ESCAPE_PATTERN, (match) => {
    return match.slice(0, 3) + "...";
  });

  return sanitized;
}

/**
 * Batch-sanitize multiple chunks.
 */
export function sanitizeChunksForPrompt(
  chunks: Array<{ file_path: string; chunk_text: string }>
): Array<{ file_path: string; chunk_text: string }> {
  return chunks.map((c) => ({
    file_path: c.file_path,
    chunk_text: sanitizeChunkForPrompt(c.chunk_text),
  }));
}

/**
 * Check if a text contains potential prompt injection.
 * Returns true if suspicious patterns are detected.
 * Useful for logging/alerting without blocking.
 */
export function detectPromptInjection(text: string): {
  detected: boolean;
  patterns: string[];
} {
  const found: string[] = [];

  if (ROLE_MARKER_PATTERN.test(text)) {
    found.push("role_marker");
    ROLE_MARKER_PATTERN.lastIndex = 0; // reset regex state
  }

  for (const pattern of INJECTION_PHRASES) {
    if (pattern.test(text)) {
      found.push(pattern.source.slice(0, 40));
      pattern.lastIndex = 0;
    }
  }

  return { detected: found.length > 0, patterns: found };
}
