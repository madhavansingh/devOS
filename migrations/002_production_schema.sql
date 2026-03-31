-- ═══════════════════════════════════════════════════════════
-- DevOS — Production Schema Migration
-- Aligned with: project-docs/Database.md v1.0
-- Run this in: Supabase Dashboard → SQL Editor
--
-- This migration replaces the MVP schema from 001_pgvector.sql
-- with the production-grade 7-table architecture.
-- ═══════════════════════════════════════════════════════════

-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- Drop old MVP tables (if upgrading from 001_pgvector)
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS match_chunks(vector(768), uuid, int);
DROP TABLE IF EXISTS public.code_chunks CASCADE;
DROP TABLE IF EXISTS public.indexed_repos CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 1. USERS — maps GitHub OAuth identity to DevOS accounts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id    text UNIQUE NOT NULL,
  github_login text NOT NULL,
  email        text,
  avatar_url   text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. REPOSITORIES — every repo a user has explored or indexed
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.repositories (
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

-- ─────────────────────────────────────────────────────────────
-- 3. FILES — individual files within an indexed repo
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id     uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  path        text NOT NULL,
  size_bytes  int DEFAULT 0,
  language    text,
  chunk_count int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(repo_id, path)
);

-- ─────────────────────────────────────────────────────────────
-- 4. CHUNKS — the RAG vector store (pgvector 768-dim)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chunks (
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

-- ─────────────────────────────────────────────────────────────
-- 5. CHATS — conversation sessions between user and DevOS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  repo_id     uuid REFERENCES public.repositories(id) ON DELETE SET NULL,
  title       text DEFAULT 'New Chat',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 6. MESSAGES — individual messages within a chat session
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     text NOT NULL,
  cited_files text[] DEFAULT '{}',
  token_count int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 7. INDEXING_JOBS — async indexing pipeline tracking
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.indexing_jobs (
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


-- ═══════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════

-- Vector similarity search (IVFFlat for MVP, upgrade to HNSW at scale)
CREATE INDEX IF NOT EXISTS chunks_embedding_ivfflat_idx
  ON public.chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Composite lookup indexes
CREATE INDEX IF NOT EXISTS idx_repos_user_owner_name
  ON public.repositories(user_id, owner, name);

CREATE INDEX IF NOT EXISTS idx_files_repo_path
  ON public.files(repo_id, path);

CREATE INDEX IF NOT EXISTS idx_chunks_repo
  ON public.chunks(repo_id);

CREATE INDEX IF NOT EXISTS idx_indexing_jobs_repo_status
  ON public.indexing_jobs(repo_id, status);

CREATE INDEX IF NOT EXISTS idx_chats_user_updated
  ON public.chats(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created
  ON public.messages(chat_id, created_at ASC);


-- ═══════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════

-- Semantic similarity search for RAG chat
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


-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexing_jobs ENABLE ROW LEVEL SECURITY;

-- Service role (used by DevOS backend) bypasses RLS
-- Anon/authenticated users are restricted to their own data

-- Users
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- Repositories
CREATE POLICY "repos_select_own" ON public.repositories
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "repos_insert_own" ON public.repositories
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "repos_delete_own" ON public.repositories
  FOR DELETE USING (user_id = auth.uid());

-- Files (inherit via repo)
CREATE POLICY "files_select_own" ON public.files
  FOR SELECT USING (
    repo_id IN (SELECT id FROM public.repositories WHERE user_id = auth.uid())
  );

-- Chunks (inherit via repo)
CREATE POLICY "chunks_select_own" ON public.chunks
  FOR SELECT USING (
    repo_id IN (SELECT id FROM public.repositories WHERE user_id = auth.uid())
  );

-- Chats
CREATE POLICY "chats_select_own" ON public.chats
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "chats_insert_own" ON public.chats
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "chats_delete_own" ON public.chats
  FOR DELETE USING (user_id = auth.uid());

-- Messages (inherit via chat)
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT USING (
    chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid())
  );
CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT WITH CHECK (
    chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid())
  );

-- Indexing Jobs
CREATE POLICY "jobs_select_own" ON public.indexing_jobs
  FOR SELECT USING (user_id = auth.uid());
