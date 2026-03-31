/**
 * Centralized, validated environment variable access.
 *
 * WHY THIS FILE EXISTS:
 * - Every env var is validated at startup — the app refuses to boot with
 *   a clear error instead of failing cryptically at runtime.
 * - Server-only secrets are never accidentally leaked to client bundles
 *   because they aren't prefixed with NEXT_PUBLIC_.
 * - One import (`@/lib/env`) replaces scattered `process.env.X!` casts.
 */

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `❌ Missing required environment variable: ${name}\n` +
        `   → Copy .env.example to .env.local and fill in all values.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

// ─────────────────────────────────────────────────────────────
// Server-only secrets (never start with NEXT_PUBLIC_)
// These are only available in API routes and server components.
// ─────────────────────────────────────────────────────────────

export const serverEnv = {
  /** NextAuth v5 encryption secret (>= 32 chars, generated via `npx auth secret`) */
  AUTH_SECRET: required("AUTH_SECRET"),

  /** GitHub OAuth App — Client ID */
  GITHUB_CLIENT_ID: required("GITHUB_CLIENT_ID"),

  /** GitHub OAuth App — Client Secret (NEVER expose to client) */
  GITHUB_CLIENT_SECRET: required("GITHUB_CLIENT_SECRET"),

  /** Supabase service-role key — bypasses RLS. Server-side only. */
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),

  /** Ollama API base URL */
  OLLAMA_BASE_URL: optional("OLLAMA_BASE_URL", "http://localhost:11434"),

  /** Ollama chat model */
  OLLAMA_MODEL: optional("OLLAMA_MODEL", "qwen2.5-coder"),

  /** Ollama embedding model */
  OLLAMA_EMBED_MODEL: optional("OLLAMA_EMBED_MODEL", "nomic-embed-text"),

  /** Redis connection URL — required for rate limiting, caching, job queue */
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6379"),

  /** RAG retrieval mode: "vector" (stable) or "hybrid" (vector + keyword) */
  RETRIEVAL_MODE: optional("RETRIEVAL_MODE", "vector") as "vector" | "hybrid",
} as const;

// ─────────────────────────────────────────────────────────────
// Public variables (safe for client bundles)
// These MUST start with NEXT_PUBLIC_ for Next.js to inline them.
// ─────────────────────────────────────────────────────────────

export const publicEnv = {
  /** Supabase project URL (e.g. https://xxx.supabase.co) */
  SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL"),

  /** Supabase anonymous/public key (safe for browsers — restricted by RLS) */
  SUPABASE_ANON_KEY: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
} as const;
