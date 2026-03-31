# API Specification
**Product Name:** DevOS  
**Version:** 1.0 (MVP)  
**Base URL:** `http://localhost:3000/api` (dev) | `https://devos.app/api` (prod)  
**Auth:** NextAuth v5 session cookies (GitHub OAuth)

---

## 1. API Design Principles

1. **Session-Based Auth:** All endpoints (except auth callbacks) require a valid NextAuth session. Unauthenticated requests receive `401`.
2. **JSON by Default:** Request/Response bodies are `application/json` unless streaming (AI endpoints use `text/plain` with streamed chunks).
3. **Consistent Error Format:** Every error response follows the standard envelope (see §7).
4. **Rate Limiting:** GitHub API calls are subject to external limits. Internal AI endpoints are self-throttled (see §8).
5. **Idempotent where possible:** Re-indexing the same repo skips work if indexed within the last hour.

---

## 2. Auth Endpoints

Authentication is handled entirely by NextAuth v5 with the GitHub provider. DevOS does not implement custom auth logic — it delegates to the NextAuth middleware.

### 2.1 `GET /api/auth/signin`
**Description:** Redirects the user to GitHub's OAuth authorization page.  
**Auth Required:** No  
**Response:** `302 Redirect` → GitHub OAuth consent screen

### 2.2 `GET /api/auth/callback/github`
**Description:** GitHub redirects here after authorization. NextAuth exchanges the code for an access token.  
**Auth Required:** No  
**Response:** `302 Redirect` → `/dashboard` (on success) or `/login?error=...` (on failure)

### 2.3 `GET /api/auth/session`
**Description:** Returns the current user session.  
**Auth Required:** Yes (session cookie)

**Response `200`:**
```json
{
  "user": {
    "name": "Madhavan Singh",
    "email": "maddy@example.com",
    "image": "https://avatars.githubusercontent.com/u/12345",
    "githubLogin": "maddy"
  },
  "accessToken": "gho_xxxx...",
  "expires": "2026-04-28T18:00:00.000Z"
}
```

### 2.4 `POST /api/auth/signout`
**Description:** Destroys the session cookie and logs the user out.  
**Auth Required:** Yes  
**Response:** `302 Redirect` → `/`

---

## 3. GitHub Proxy Endpoints

These endpoints proxy requests to the GitHub API, injecting the user's access token server-side so it never reaches the browser's network tab.

### 3.1 `GET /api/github/tree`
**Description:** Fetches the full recursive file tree for a repository, including metadata.

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `owner` | `string` | ✅ | Repository owner (e.g. `facebook`) |
| `repo` | `string` | ✅ | Repository name (e.g. `react`) |

**Response `200`:**
```json
{
  "meta": {
    "owner": "facebook",
    "name": "react",
    "defaultBranch": "main",
    "description": "The library for web and native user interfaces.",
    "stars": 228000,
    "language": "JavaScript"
  },
  "tree": [
    {
      "name": "src",
      "path": "src",
      "type": "folder",
      "children": [
        {
          "name": "index.ts",
          "path": "src/index.ts",
          "type": "file"
        }
      ]
    }
  ]
}
```

**TypeScript Types:**
```typescript
interface RepoMeta {
  owner: string;
  name: string;
  defaultBranch: string;
  description: string | null;
  stars: number;
  language: string | null;
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
}

interface TreeResponse {
  meta: RepoMeta;
  tree: FileNode[];
}
```

---

### 3.2 `GET /api/github/blob`
**Description:** Fetches the raw text content of a single file. First attempts `raw.githubusercontent.com` (public CDN), falls back to the authenticated GitHub Contents API for private repos.

**Query Parameters:**
| Param | Type | Required | Description |
|---|---|---|---|
| `owner` | `string` | ✅ | Repository owner |
| `repo` | `string` | ✅ | Repository name |
| `branch` | `string` | ✅ | Git branch or tag |
| `path` | `string` | ✅ | File path from root (e.g. `src/auth.ts`) |

**Response `200`:**
```json
{
  "content": "import { NextAuth } from 'next-auth';\n...",
  "language": "typescript",
  "path": "src/auth.ts"
}
```

**TypeScript Types:**
```typescript
interface BlobResponse {
  content: string;
  language: string;
  path: string;
}
```

---

## 4. AI Endpoints

All AI endpoints communicate with the local Ollama instance. Chat and Explain endpoints stream responses using **Fetch Streaming** (chunked `text/plain`).

### 4.1 `POST /api/ai/explain`
**Description:** Generates a natural-language explanation of a single file. This is a **zero-shot** operation — the full file content is sent directly to the LLM without RAG retrieval.

**Request Body:**
```json
{
  "filePath": "src/lib/auth.ts",
  "fileContent": "import NextAuth from 'next-auth';\n..."
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `filePath` | `string` | ✅ | Display name for context |
| `fileContent` | `string` | ✅ | Max 30,000 characters. Truncated server-side if exceeded. |

**Response `200`:** Streamed `text/plain; charset=utf-8`
```
## Summary
This file configures NextAuth.js with GitHub OAuth...

## Key Functions
- `auth()`: Returns the current session...

## Dependencies
- `next-auth`: v5 beta...
```

**Response Headers:**
```
Content-Type: text/plain; charset=utf-8
X-Content-Type-Options: nosniff
Cache-Control: no-cache
```

---

### 4.2 `POST /api/ai/chat`
**Description:** RAG-powered conversational endpoint. Embeds the user's query, retrieves relevant code chunks via vector similarity, and streams a contextual AI response.

**Request Body:**
```json
{
  "query": "How does authentication work in this app?",
  "owner": "facebook",
  "repo": "react",
  "branch": "main",
  "history": [
    { "role": "user", "content": "What files handle routing?" },
    { "role": "assistant", "content": "Routing is handled in..." }
  ]
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `query` | `string` | ✅ | The user's natural language question |
| `owner` | `string` | ✅ | Repo owner |
| `repo` | `string` | ✅ | Repo name |
| `branch` | `string` | ✅ | Git branch |
| `history` | `OllamaMessage[]` | ❌ | Last N turns of conversation (max 6 messages retained) |

**RAG Retrieval Strategy:**
| Parameter | Value | Description |
|---|---|---|
| Embedding model | `nomic-embed-text` | 768-dim vectors |
| Top-K retrieval | `5` (default, configurable) | Number of chunks returned from vector search |
| Similarity metric | Cosine distance (`<=>`) | Standard for text embeddings |
| Diversity | Distinct file paths preferred | Avoids returning 5 chunks from the same file |
| Re-ranking | Optional (Phase 2) | Cross-encoder re-ranking for improved precision |

**Response `200`:** Streamed `text/plain; charset=utf-8`
```
Authentication in this app is handled primarily in `src/auth.ts`...

The middleware in `middleware.ts` intercepts requests...
```

**Error Responses:**
- `200` (inline text): "⚠️ This repository hasn't been indexed yet..." — when repo isn't in vector DB
- `200` (inline text): "I couldn't find relevant code snippets..." — when vector search returns 0 results

---

### 4.3 `POST /api/ai/index`
**Description:** Triggers the full indexing pipeline for a repository. Fetches files from GitHub, chunks them, generates embeddings via Ollama, and stores vectors in Supabase.

**Request Body:**
```json
{
  "owner": "facebook",
  "repo": "react"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `owner` | `string` | ✅ | Repo owner |
| `repo` | `string` | ✅ | Repo name |

**Response `200` (already indexed recently):**
```json
{
  "message": "Already indexed",
  "repoId": "a1b2c3d4-...",
  "chunkCount": 142
}
```

**Response `200` (freshly indexed):**
```json
{
  "message": "Indexing complete",
  "repoId": "a1b2c3d4-...",
  "filesProcessed": 87,
  "chunksCreated": 142,
  "skipped": 213
}
```

**Index Freshness:** If a repo was indexed within the last **1 hour**, the endpoint returns immediately with the cached result. Otherwise, it re-indexes.

---

## 5. Streaming Response Format

AI endpoints (`/api/ai/explain`, `/api/ai/chat`) use **Fetch Streaming** over HTTP/1.1, not Server-Sent Events.

### 5.1 Transport Details

| Aspect | Value |
|---|---|
| **Protocol** | Standard HTTP response with chunked transfer encoding |
| **Content-Type** | `text/plain; charset=utf-8` |
| **Streaming Method** | `ReadableStream` piped to `new Response(stream)` |
| **Client Consumption** | `fetch()` + `reader.read()` loop with `TextDecoder` |

### 5.2 Client-Side Consumption Pattern

```typescript
const res = await fetch("/api/ai/explain", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ filePath, fileContent }),
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let result = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  result += decoder.decode(value, { stream: true });
  // Update UI with `result` incrementally
}
```

### 5.3 Backend Streaming Implementation

The backend reads Ollama's NDJSON stream, extracts `message.content` tokens, and re-encodes them as raw UTF-8 text chunks:

```
Ollama → NDJSON lines → parse JSON → extract .message.content → encode UTF-8 → pipe to client
```

---

## 6. Request/Response Type Definitions

### 6.1 Common Types

```typescript
// Ollama message format (used in chat history)
interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Standard error envelope
interface ErrorResponse {
  error: string;
  code?: string;
  details?: string;
}
```

### 6.2 Index Types

```typescript
interface IndexRequest {
  owner: string;
  repo: string;
}

interface IndexResponse {
  message: string;
  repoId: string;
  filesProcessed?: number;
  chunksCreated?: number;
  skipped?: number;
}
```

### 6.3 Chat Types

```typescript
interface ChatRequest {
  query: string;
  owner: string;
  repo: string;
  branch: string;
  history?: OllamaMessage[];
}
// Response is streamed text, not JSON
```

### 6.4 Explain Types

```typescript
interface ExplainRequest {
  filePath: string;
  fileContent: string;
}
// Response is streamed text, not JSON
```

---

## 7. Error Handling

### 7.1 Standard Error Response Format

All non-streaming endpoints return errors in this format:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": "Optional stack trace or debug info (dev only)"
}
```

### 7.2 HTTP Status Code Mapping

| Status | Usage | Example |
|---|---|---|
| `400` | Invalid request body or missing required fields | `{ "error": "Missing owner or repo query params" }` |
| `401` | No valid session / unauthenticated | `{ "error": "Unauthorized" }` |
| `403` | User lacks permission for the resource | `{ "error": "Private repo access denied" }` |
| `404` | Resource not found | `{ "error": "Repository not found" }` |
| `429` | Rate limit exceeded (internal throttle) | `{ "error": "Too many requests. Please retry in 60s." }` |
| `500` | Unexpected server error | `{ "error": "Indexing failed", "details": "..." }` |
| `502` | Upstream dependency failure (GitHub API, Ollama) | `{ "error": "GitHub API unreachable" }` |
| `504` | Upstream timeout | `{ "error": "Ollama response timed out" }` |

---

## 8. Rate Limiting Strategy

### 8.1 External: GitHub API

GitHub imposes **5,000 requests/hour** for authenticated users. DevOS mitigates this:

| Strategy | Implementation |
|---|---|
| **Request Caching** | Next.js `fetch` with `revalidate: 60s` for repo metadata, `30s` for trees |
| **Single Tree Call** | Uses `?recursive=1` to get the entire tree in 1 API call |
| **Raw CDN First** | File content fetched from `raw.githubusercontent.com` (not rate-limited) before falling back to API |
| **Rate Header Monitoring** | Check `X-RateLimit-Remaining` header; if < 100, queue non-critical requests |

### 8.2 Internal: AI Endpoints

| Endpoint | Limit | Window | Rationale |
|---|---|---|---|
| `/api/ai/explain` | 30 requests | per user per hour | Prevent LLM abuse |
| `/api/ai/chat` | 50 requests | per user per hour | Allow reasonable exploration |
| `/api/ai/index` | 5 requests | per user per hour | Indexing is expensive (batch embeddings) |

**Implementation:** Use in-memory Map keyed by `session.user.id + endpoint`, resetting every hour. Phase 2 upgrades to Redis/Upstash for distributed rate limiting.

---

## 9. Retry & Timeout Handling

### 9.1 GitHub API Calls

| Parameter | Value | Notes |
|---|---|---|
| **Timeout** | 15 seconds | Per-request timeout via `AbortController` |
| **Max Retries** | 3 | For `5xx` and network errors only |
| **Backoff** | Exponential (1s → 2s → 4s) | With ±500ms jitter |
| **Rate Limit (429)** | Wait for `X-RateLimit-Reset` header | Do NOT retry immediately |
| **4xx Errors** | No retry | Client errors are not transient |

### 9.2 Ollama API Calls

| Parameter | Value | Notes |
|---|---|---|
| **Chat Timeout** | 120 seconds | Large context windows can be slow |
| **Embedding Timeout** | 30 seconds | Single embedding should be fast |
| **Batch Embedding** | 5 concurrent | Sequential batches to avoid overloading local GPU |
| **Max Retries** | 2 | Ollama errors are usually persistent (model not loaded) |
| **Backoff** | Fixed 2s delay | Local service — exponential backoff unnecessary |
| **Connection Refused** | Fail fast with `502` | User-friendly message: "AI engine offline" |

### 9.3 Retry Implementation Pattern

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
    retryOn?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, timeoutMs = 15000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const result = await fn();
      clearTimeout(timer);
      return result;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      if (options.retryOn && !options.retryOn(error)) throw error;

      const jitter = Math.random() * 500;
      const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}
```

---

## 10. Endpoint Summary Table

| Method | Path | Auth | Returns | Description |
|---|---|---|---|---|
| `GET` | `/api/auth/signin` | ❌ | `302` | Redirect to GitHub OAuth |
| `GET` | `/api/auth/callback/github` | ❌ | `302` | OAuth callback handler |
| `GET` | `/api/auth/session` | ✅ | JSON | Current user session |
| `POST` | `/api/auth/signout` | ✅ | `302` | Destroy session |
| `GET` | `/api/github/tree` | ✅ | JSON | Nested file tree + repo metadata |
| `GET` | `/api/github/blob` | ✅ | JSON | Raw file content + language |
| `POST` | `/api/ai/explain` | ✅ | Stream | Zero-shot file explanation |
| `POST` | `/api/ai/chat` | ✅ | Stream | RAG-powered repo conversation |
| `POST` | `/api/ai/index` | ✅ | JSON | Trigger indexing pipeline |
