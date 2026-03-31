-- ═══════════════════════════════════════════════════════════
-- DevOS — Supabase pgvector Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Enable pgvector extension
create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────
-- Users table (maps GitHub identity to DevOS account)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  github_id   text unique not null,
  github_login text not null,
  email       text,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Indexed repos (tracks which repos have been chunked & embedded)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.indexed_repos (
  id          uuid primary key default gen_random_uuid(),
  owner       text not null,
  repo        text not null,
  branch      text not null,
  indexed_at  timestamptz default now(),
  chunk_count int default 0,
  unique(owner, repo, branch)
);

-- ─────────────────────────────────────────────────────────────
-- Code chunks with vector embeddings (the RAG store)
-- nomic-embed-text produces 768-dim vectors
-- ─────────────────────────────────────────────────────────────
create table if not exists public.code_chunks (
  id          bigserial primary key,
  repo_id     uuid references public.indexed_repos(id) on delete cascade,
  file_path   text not null,
  chunk_index int not null,
  chunk_text  text not null,
  embedding   vector(768),
  created_at  timestamptz default now()
);

-- Index for fast vector similarity search (cosine distance)
create index if not exists code_chunks_embedding_idx
  on public.code_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─────────────────────────────────────────────────────────────
-- RPC: match_chunks — semantic similarity search
-- Called by the RAG chat API route
-- ─────────────────────────────────────────────────────────────
create or replace function match_chunks(
  query_embedding  vector(768),
  target_repo_id   uuid,
  match_count      int default 5
)
returns table (
  file_path   text,
  chunk_text  text,
  similarity  float
)
language sql stable
as $$
  select
    chunk_text,
    file_path,
    1 - (embedding <=> query_embedding) as similarity
  from public.code_chunks
  where repo_id = target_repo_id
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS (Row Level Security) — enable but allow service role full access
-- ─────────────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.indexed_repos enable row level security;
alter table public.code_chunks enable row level security;

-- Service role bypasses RLS (used by DevOS backend)
create policy "service_role_all" on public.users
  for all using (true) with check (true);
create policy "service_role_all" on public.indexed_repos
  for all using (true) with check (true);
create policy "service_role_all" on public.code_chunks
  for all using (true) with check (true);
