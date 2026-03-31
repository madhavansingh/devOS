# Database Schema & Architecture
**Product Name:** DevOS  
**Version:** 1.0 (MVP)  
**Engine:** PostgreSQL 15+ via Supabase  
**Vector Extension:** pgvector (768-dimensional, `nomic-embed-text`)

---

## 1. Entity-Relationship Overview

```
users ──┬── repositories ──┬── files ── chunks (pgvector)
        │                  └── indexing_jobs
        └── chats ── messages
```

**Cascade Rule:** Deleting a parent record cascades to all children. Deleting a `user` removes their repos, files, chunks, chats, and messages. Deleting a `repository` removes its files, chunks, and indexing jobs.

---

## 2. Table Definitions

### 2.1 `users`
Maps GitHub OAuth identity to DevOS accounts. Created or updated on every successful login.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | `PK, DEFAULT gen_random_uuid()` | Internal DevOS user ID |
| `github_id` | `text` | `UNIQUE NOT NULL` | GitHub numeric user ID |
| `github_login` | `text` | `NOT NULL` | GitHub username (e.g. `maddy`) |
| `email` | `text` | `NULLABLE` | GitHub primary email |
| `avatar_url` | `text` | `NULLABLE` | GitHub profile picture |
| `created_at` | `timestamptz` | `DEFAULT now()` | First login timestamp |
| `updated_at` | `timestamptz` | `DEFAULT now()` | Last profile sync |

```sql
CREATE TABLE public.users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id   text UNIQUE NOT NULL,
  github_login text NOT NULL,
  email       text,
  avatar_url  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

---

### 2.2 `repositories`
Tracks every repository a user has explored or indexed in DevOS. Stores a `commit_hash` for reproducible point-in-time context.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | `PK, DEFAULT gen_random_uuid()` | Internal repo ID |
| `user_id` | `uuid` | `FK → users(id) ON DELETE CASCADE, NOT NULL` | Owner in DevOS |
| `owner` | `text` | `NOT NULL` | GitHub org/user (e.g. `facebook`) |
| `name` | `text` | `NOT NULL` | Repo name (e.g. `react`) |
| `default_branch` | `text` | `NOT NULL` | Branch used for indexing (e.g. `main`) |
| `commit_hash` | `text` | `NULLABLE` | HEAD commit SHA at index time |
| `description` | `text` | `NULLABLE` | GitHub repo description |
| `stars` | `int` | `DEFAULT 0` | Stargazer count at fetch time |
| `language` | `text` | `NULLABLE` | Primary language detected by GitHub |
| `indexed` | `boolean` | `DEFAULT false` | Whether RAG indexing has completed |
| `created_at` | `timestamptz` | `DEFAULT now()` | First explored |
| `updated_at` | `timestamptz` | `DEFAULT now()` | Last metadata refresh |

```sql
CREATE TABLE public.repositories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  owner           text NOT NULL,
  name            text NOT NULL,
  default_branch  text NOT NULL,
  commit_hash     text,
  description     text,
  stars           int DEFAULT 0,
  language        text,
  indexed         boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, owner, name)
);
```

---

### 2.3 `files`
Records every file within an indexed repository. Acts as the parent for code chunks.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | `PK, DEFAULT gen_random_uuid()` | File record ID |
| `repo_id` | `uuid` | `FK → repositories(id) ON DELETE CASCADE, NOT NULL` | Parent repo |
| `path` | `text` | `NOT NULL` | Full file path from repo root (e.g. `src/auth.ts`) |
| `size_bytes` | `int` | `DEFAULT 0` | File size in bytes |
| `language` | `text` | `NULLABLE` | Detected language (e.g. `typescript`) |
| `chunk_count` | `int` | `DEFAULT 0` | Number of chunks generated for this file |
| `created_at` | `timestamptz` | `DEFAULT now()` | Indexed timestamp |

```sql
CREATE TABLE public.files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id     uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  path        text NOT NULL,
  size_bytes  int DEFAULT 0,
  language    text,
  chunk_count int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(repo_id, path)
);
```

---

### 2.4 `chunks`
The RAG vector store. Each row is an embedded code snippet linked to a file.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `bigserial` | `PK` | Auto-incrementing chunk ID |
| `repo_id` | `uuid` | `FK → repositories(id) ON DELETE CASCADE, NOT NULL` | Parent repo (denormalized for fast RPC) |
| `file_id` | `uuid` | `FK → files(id) ON DELETE CASCADE, NOT NULL` | Parent file |
| `file_path` | `text` | `NOT NULL` | Denormalized file path for query results |
| `chunk_index` | `int` | `NOT NULL` | Position within the file (0-based) |
| `chunk_text` | `text` | `NOT NULL` | Raw code text of this chunk |
| `embedding` | `vector(768)` | `NULLABLE` | `nomic-embed-text` embedding |
| `token_count` | `int` | `DEFAULT 0` | Estimated token count for context budgeting |
| `created_at` | `timestamptz` | `DEFAULT now()` | Insertion timestamp |

```sql
CREATE TABLE public.chunks (
  id          bigserial PRIMARY KEY,
  repo_id     uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  file_id     uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  file_path   text NOT NULL,
  chunk_index int NOT NULL,
  chunk_text  text NOT NULL,
  embedding   vector(768),
  token_count int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);
```

---

### 2.5 `chats`
A chat session between a user and DevOS about a specific repository.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | `PK, DEFAULT gen_random_uuid()` | Chat session ID |
| `user_id` | `uuid` | `FK → users(id) ON DELETE CASCADE, NOT NULL` | Chat owner |
| `repo_id` | `uuid` | `FK → repositories(id) ON DELETE SET NULL` | Repo context (nullable if repo is deleted) |
| `title` | `text` | `DEFAULT 'New Chat'` | Auto-generated or user-set title |
| `created_at` | `timestamptz` | `DEFAULT now()` | Session start |
| `updated_at` | `timestamptz` | `DEFAULT now()` | Last message timestamp |

```sql
CREATE TABLE public.chats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  repo_id     uuid REFERENCES public.repositories(id) ON DELETE SET NULL,
  title       text DEFAULT 'New Chat',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

---

### 2.6 `messages`
Individual messages within a chat session. Stores both user queries and AI responses.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | `PK, DEFAULT gen_random_uuid()` | Message ID |
| `chat_id` | `uuid` | `FK → chats(id) ON DELETE CASCADE, NOT NULL` | Parent chat |
| `role` | `text` | `NOT NULL, CHECK (role IN ('user', 'assistant', 'system'))` | Message sender |
| `content` | `text` | `NOT NULL` | Message body (Markdown for assistant) |
| `cited_files` | `text[]` | `DEFAULT '{}'` | File paths referenced in the response |
| `token_count` | `int` | `DEFAULT 0` | Token consumption for this message |
| `created_at` | `timestamptz` | `DEFAULT now()` | Sent timestamp |

```sql
CREATE TABLE public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     text NOT NULL,
  cited_files text[] DEFAULT '{}',
  token_count int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);
```

---

### 2.7 `indexing_jobs`
Tracks asynchronous repository indexing operations. Enables the UI to poll for progress and display status.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | `PK, DEFAULT gen_random_uuid()` | Job ID |
| `repo_id` | `uuid` | `FK → repositories(id) ON DELETE CASCADE, NOT NULL` | Target repo |
| `user_id` | `uuid` | `FK → users(id) ON DELETE CASCADE, NOT NULL` | Requester |
| `status` | `text` | `NOT NULL, DEFAULT 'pending', CHECK(...)` | `pending` → `indexing` → `completed` / `failed` |
| `total_files` | `int` | `DEFAULT 0` | Total eligible files discovered |
| `processed_files` | `int` | `DEFAULT 0` | Files successfully chunked + embedded |
| `total_chunks` | `int` | `DEFAULT 0` | Total chunks created |
| `error_message` | `text` | `NULLABLE` | Failure reason (if status = `failed`) |
| `started_at` | `timestamptz` | `NULLABLE` | When processing began |
| `completed_at` | `timestamptz` | `NULLABLE` | When processing finished |
| `created_at` | `timestamptz` | `DEFAULT now()` | Job creation timestamp |

```sql
CREATE TABLE public.indexing_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id         uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'indexing', 'completed', 'failed')),
  total_files     int DEFAULT 0,
  processed_files int DEFAULT 0,
  total_chunks    int DEFAULT 0,
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);
```

---

## 3. Indexes

### 3.1 Vector Similarity Index
Uses IVFFlat for fast approximate nearest-neighbor search on 768-dim vectors. HNSW is preferred for production (better recall) once chunk volume exceeds ~50K rows.

```sql
-- IVFFlat index for MVP (fast to build, good for < 100K vectors)
CREATE INDEX chunks_embedding_ivfflat_idx
  ON public.chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Future upgrade path: HNSW index (better recall, slower to build)
-- CREATE INDEX chunks_embedding_hnsw_idx
--   ON public.chunks
--   USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
```

### 3.2 Composite & Lookup Indexes

```sql
-- Fast repo lookup by owner+name per user
CREATE INDEX idx_repos_user_owner_name ON public.repositories(user_id, owner, name);

-- Fast file lookup within a repo
CREATE INDEX idx_files_repo_path ON public.files(repo_id, path);

-- Fast chunk retrieval by repo (used in RAG RPC)
CREATE INDEX idx_chunks_repo ON public.chunks(repo_id);

-- Job status polling
CREATE INDEX idx_indexing_jobs_repo_status ON public.indexing_jobs(repo_id, status);

-- Chat listing for a user (most recent first)
CREATE INDEX idx_chats_user_updated ON public.chats(user_id, updated_at DESC);

-- Message ordering within a chat
CREATE INDEX idx_messages_chat_created ON public.messages(chat_id, created_at ASC);
```

---

## 4. RPC Functions

### 4.1 `match_chunks` — Semantic Similarity Search

Called by the RAG chat API. Returns the top-K most relevant code chunks for a given query embedding.

```sql
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding  vector(768),
  target_repo_id   uuid,
  match_count      int DEFAULT 5
)
RETURNS TABLE (
  id          bigint,
  file_path   text,
  chunk_text  text,
  chunk_index int,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.file_path,
    c.chunk_text,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.chunks c
  WHERE c.repo_id = target_repo_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

---

## 5. Row Level Security (RLS)

All tables have RLS enabled. The DevOS backend uses the **service_role** key which bypasses RLS for trusted server operations. Client-side queries (if any) are restricted by `auth.uid()`.

### 5.1 Enable RLS on All Tables

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexing_jobs ENABLE ROW LEVEL SECURITY;
```

### 5.2 User Isolation Policies

Users can only read/write their own data. The `service_role` bypasses these for backend operations.

```sql
-- Users: can read own profile
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- Repositories: scoped to owner
CREATE POLICY "repos_select_own" ON public.repositories
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "repos_insert_own" ON public.repositories
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "repos_delete_own" ON public.repositories
  FOR DELETE USING (user_id = auth.uid());

-- Files: inherit from repo ownership
CREATE POLICY "files_select_own" ON public.files
  FOR SELECT USING (
    repo_id IN (SELECT id FROM public.repositories WHERE user_id = auth.uid())
  );

-- Chunks: inherit from repo ownership
CREATE POLICY "chunks_select_own" ON public.chunks
  FOR SELECT USING (
    repo_id IN (SELECT id FROM public.repositories WHERE user_id = auth.uid())
  );

-- Chats: scoped to chat owner
CREATE POLICY "chats_select_own" ON public.chats
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "chats_insert_own" ON public.chats
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "chats_delete_own" ON public.chats
  FOR DELETE USING (user_id = auth.uid());

-- Messages: inherit from chat ownership
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT USING (
    chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid())
  );
CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT WITH CHECK (
    chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid())
  );

-- Indexing Jobs: scoped to requester
CREATE POLICY "jobs_select_own" ON public.indexing_jobs
  FOR SELECT USING (user_id = auth.uid());
```

---

## 6. Indexing Pipeline

The end-to-end flow for processing a repository into the RAG vector store.

### 6.1 Pipeline Stages

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. TRIGGER       │ →   │ 2. PARSE     │ →   │ 3. CHUNK     │ →   │ 4. EMBED     │ →   │ 5. STORE     │
│ User requests    │     │ Filter files │     │ Split into   │     │ Generate     │     │ Insert into  │
│ indexing via UI  │     │ by rules     │     │ overlapping  │     │ 768-dim      │     │ chunks table │
│                  │     │              │     │ segments     │     │ vectors      │     │ in Supabase  │
└─────────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### 6.2 Stage Details

| Stage | Input | Output | Rules |
|---|---|---|---|
| **Trigger** | User clicks "Index Repository" | `indexing_jobs` row with status `pending` | Only 1 active job per repo at a time |
| **Parse** | GitHub file tree | Filtered file list | Apply size limits + extension filters (see §6.3) |
| **Chunk** | Raw file text | Array of `{ filePath, chunkIndex, text }` | 80 lines/chunk, 10-line overlap |
| **Embed** | Chunk text strings | `number[][]` (768-dim vectors) | Batch size: 5, model: `nomic-embed-text` |
| **Store** | Chunks + embeddings | Rows in `chunks` table | Insert in batches of 100, delete old chunks first |

### 6.3 File Filtering Rules

**Maximum Repository Limits:**
| Limit | Value | Rationale |
|---|---|---|
| Max files to index | 300 | Prevent runaway for monorepos |
| Max single file size | 60 KB | LLM context window protection |
| Max total repo text | 50 MB | Supabase payload guard |

**Skipped File Extensions:**
```
Images:      png, jpg, jpeg, gif, svg, ico, webp, avif
Fonts:       woff, woff2, ttf, eot
Media:       mp4, mp3, wav
Archives:    pdf, zip, tar, gz
Lock files:  lock, sum
Minified:    min.js, min.css
Source maps:  map
```

**Skipped Directory Paths:**
```
node_modules, .git, dist, build, .next, coverage,
vendor, __pycache__, .venv, .cache, .turbo
```

### 6.4 Status Lifecycle

```
pending  ──→  indexing  ──→  completed
                  │
                  └──→  failed (error_message set)
```

The frontend polls `GET /api/ai/index/status?repo_id=X` to display progress bars and status badges.

---

## 7. Version Control & Time-Travel

The `repositories.commit_hash` field stores the Git SHA of HEAD at the time of indexing. This enables:

1. **Stale Detection:** If the remote HEAD differs from stored `commit_hash`, the UI prompts re-indexing.
2. **Future Time-Travel:** Phase 2 can store multiple index snapshots by versioning `indexing_jobs` with `commit_hash`, allowing users to chat with historical versions of a codebase.

---

## 8. Caching Strategy (Database Layer)

| Data | Cache Location | TTL | Invalidation |
|---|---|---|---|
| File explanations | `messages` table (cached as chat message) | Indefinite (keyed by file path + commit hash) | Re-index triggers purge |
| Repo metadata | Next.js `fetch` cache | 60s | Automatic expiry |
| File tree | Next.js `fetch` cache | 30s | Automatic expiry |
| Embedding results | Persisted in `chunks` | Until re-index | Cascade delete on re-index |
