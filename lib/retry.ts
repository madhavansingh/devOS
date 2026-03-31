/**
 * Generic retry utility with exponential backoff, timeout, and jitter.
 * Used across GitHub API calls, Ollama requests, and Supabase operations.
 *
 * @see project-docs/API.md §9 — Retry & Timeout Handling
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 1000) */
  baseDelayMs?: number;
  /** Per-request timeout in ms (default: 15000) */
  timeoutMs?: number;
  /** Max jitter in ms added to delay (default: 500) */
  jitterMs?: number;
  /** Predicate: should this error be retried? (default: retry all) */
  retryOn?: (error: unknown) => boolean;
  /** Called before each retry with attempt number and delay */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

// ─────────────────────────────────────────────────────────────
// Core utility
// ─────────────────────────────────────────────────────────────

/**
 * Execute an async function with automatic retries, exponential backoff,
 * and per-request timeout via AbortController.
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   () => fetch("https://api.github.com/..."),
 *   { maxRetries: 3, timeoutMs: 15000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    timeoutMs = 15000,
    jitterMs = 500,
    retryOn,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) break;

      // If a custom predicate is provided, let it decide
      if (retryOn) {
        if (!retryOn(error)) break;
        // retryOn returned true — skip the generic 4xx guard
      } else {
        // No custom predicate: don't retry client errors (4xx)
        if (isHttpClientError(error)) break;
      }

      // Calculate delay with exponential backoff + jitter
      const jitter = Math.random() * jitterMs;
      const delay = baseDelayMs * Math.pow(2, attempt) + jitter;

      onRetry?.(attempt + 1, delay, error);

      await sleep(delay);
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────
// Preset configurations
// ─────────────────────────────────────────────────────────────

/** Retry config for GitHub API calls */
export const GITHUB_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 15000,
  jitterMs: 500,
  retryOn: (error) => isRetryableError(error),
  onRetry: (attempt, delay) => {
    console.warn(`[GitHub] Retry ${attempt} in ${Math.round(delay)}ms`);
  },
};

/** Retry config for Ollama chat (long timeout for large contexts) */
export const OLLAMA_CHAT_RETRY: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 2000,
  timeoutMs: 120_000,
  jitterMs: 0,
  retryOn: (error) => {
    if (isConnectionError(error)) return true;
    // Retry on 404 since capability cache is invalidated before re-throw,
    // allowing the next attempt to re-detect the correct model/endpoint.
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes("404");
  },
  onRetry: (attempt, delay, error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Ollama/Chat] Retry ${attempt} in ${Math.round(delay)}ms — ${msg.slice(0, 100)}`);
  },
};

/** Retry config for Ollama embeddings (shorter timeout) */
export const OLLAMA_EMBED_RETRY: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 2000,
  timeoutMs: 30_000,
  jitterMs: 0,
  retryOn: (error) => isConnectionError(error),
  onRetry: (attempt, delay) => {
    console.warn(`[Ollama/Embed] Retry ${attempt} in ${Math.round(delay)}ms`);
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if an error indicates a retryable condition (5xx, network, timeout) */
function isRetryableError(error: unknown): boolean {
  if (isConnectionError(error)) return true;

  // HTTP 5xx errors
  if (error instanceof Response && error.status >= 500) return true;

  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT")
  );
}

/** Check if an error is a connection-level failure */
function isConnectionError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("AbortError") ||
    msg.includes("network") ||
    msg.includes("connection")
  );
}

/** Check if an error is a 4xx client error (should NOT be retried) */
function isHttpClientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b(400|401|403|404|422)\b/.test(msg);
}
