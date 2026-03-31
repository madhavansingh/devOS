-- ═══════════════════════════════════════════════════════════
-- DevOS — Hybrid Search Migration (v3)
-- Adds: keyword search RPC, GIN text index, upgraded match_chunks
--
-- Run in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. GIN index for full-text search on chunk_text
-- ─────────────────────────────────────────────────────────────

-- Add a tsvector column for pre-computed text search vectors
ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector;

-- Populate tsvector for existing rows
UPDATE public.chunks
SET tsv = to_tsvector('english', chunk_text)
WHERE tsv IS NULL;

-- Auto-update tsvector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION chunks_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tsv := to_tsvector('english', NEW.chunk_text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chunks_tsv ON public.chunks;
CREATE TRIGGER trg_chunks_tsv
  BEFORE INSERT OR UPDATE OF chunk_text
  ON public.chunks
  FOR EACH ROW
  EXECUTE FUNCTION chunks_tsv_trigger();

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_chunks_tsv
  ON public.chunks USING gin(tsv);

-- ─────────────────────────────────────────────────────────────
-- 2. Keyword search RPC (full-text search with ts_rank)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION keyword_search_chunks(
  query_text     text,
  target_repo_id uuid,
  match_count    int DEFAULT 10
)
RETURNS TABLE (
  id          bigint,
  file_path   text,
  chunk_text  text,
  chunk_index int,
  rank        float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.file_path,
    c.chunk_text,
    c.chunk_index,
    ts_rank_cd(c.tsv, plainto_tsquery('english', query_text)) AS rank
  FROM public.chunks c
  WHERE c.repo_id = target_repo_id
    AND c.tsv @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Upgraded match_chunks with similarity threshold
-- ─────────────────────────────────────────────────────────────

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
