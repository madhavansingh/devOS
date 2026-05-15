import { createClient } from "@supabase/supabase-js";
import { serverEnv, publicEnv } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Supabase integration layer for DevOS.
 * All DB operations go through typed helpers in this file.
 *
 * @see project-docs/Database.md for schema reference
 */

// ─────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────

/**
 * Server-side admin client (service role).
 * Bypasses RLS — used for: vector inserts, chunk lookups, indexing jobs.
 * NEVER expose this to the browser.
 */
let _adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient<Database>(publicEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _adminClient;
}

/**
 * Client-side/anon client (safe to use in client components).
 * Restricted by RLS policies (auth.uid() scoped).
 */
export function getSupabaseClient() {
  return createClient<Database>(publicEnv.SUPABASE_URL, publicEnv.SUPABASE_ANON_KEY);
}

// ─────────────────────────────────────────────────────────────
// Types (aligned with 002_production_schema.sql)
// ─────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  github_id: string;
  github_login: string;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbRepository {
  id: string;
  user_id: string;
  owner: string;
  name: string;
  default_branch: string;
  commit_hash: string | null;
  description: string | null;
  stars: number;
  language: string | null;
  indexed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbFile {
  id: string;
  repo_id: string;
  path: string;
  size_bytes: number;
  language: string | null;
  chunk_count: number;
  created_at: string;
}

export interface DbChunk {
  id: number;
  repo_id: string;
  file_id: string;
  file_path: string;
  chunk_index: number;
  chunk_text: string;
  embedding: number[] | null;
  token_count: number;
  created_at: string;
}

export interface DbIndexingJob {
  id: string;
  repo_id: string;
  user_id: string;
  status: "pending" | "indexing" | "completed" | "failed";
  total_files: number;
  processed_files: number;
  total_chunks: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ChunkMatch {
  id: number;
  file_path: string;
  chunk_text: string;
  chunk_index: number;
  similarity: number;
}

export interface KeywordMatch {
  id: number;
  file_path: string;
  chunk_text: string;
  chunk_index: number;
  rank: number;
}

export interface HybridMatch {
  id: number;
  file_path: string;
  chunk_text: string;
  chunk_index: number;
  score: number;          // combined RRF score
  vectorRank: number;     // position in vector results (0 = not found)
  keywordRank: number;    // position in keyword results (0 = not found)
}

// ─────────────────────────────────────────────────────────────
// User helpers
// ─────────────────────────────────────────────────────────────

/** Upsert a user from GitHub OAuth profile data */
export async function upsertUser(data: {
  github_id: string;
  github_login: string;
  email?: string | null;
  avatar_url?: string | null;
}): Promise<DbUser> {
  const db = getSupabaseAdmin();
  const { data: user, error } = await db
    .from("users")
    .upsert(
      {
        github_id: data.github_id,
        github_login: data.github_login,
        email: data.email ?? null,
        avatar_url: data.avatar_url ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "github_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to upsert user: ${error.message}`);
  return user;
}

// ─────────────────────────────────────────────────────────────
// Repository helpers
// ─────────────────────────────────────────────────────────────

/** Upsert a repository for a user. Returns the repo record. */
export async function upsertRepository(
  userId: string,
  data: {
    owner: string;
    name: string;
    default_branch: string;
    commit_hash?: string;
    description?: string | null;
    stars?: number;
    language?: string | null;
  }
): Promise<DbRepository> {
  const db = getSupabaseAdmin();
  const { data: repo, error } = await db
    .from("repositories")
    .upsert(
      {
        user_id: userId,
        owner: data.owner,
        name: data.name,
        default_branch: data.default_branch,
        commit_hash: data.commit_hash ?? null,
        description: data.description ?? null,
        stars: data.stars ?? 0,
        language: data.language ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,owner,name" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to upsert repository: ${error.message}`);
  return repo;
}

/** Get a repository by owner+name for a user */
export async function getRepository(
  userId: string,
  owner: string,
  name: string
): Promise<DbRepository | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("repositories")
    .select("*")
    .eq("user_id", userId)
    .eq("owner", owner)
    .eq("name", name)
    .single();
  return data ?? null;
}

/** Get a repository by its ID */
export async function getRepositoryById(repoId: string): Promise<DbRepository | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("repositories")
    .select("*")
    .eq("id", repoId)
    .single();
  return data ?? null;
}

/** Mark a repository as indexed */
export async function markRepoIndexed(repoId: string, commitHash: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("repositories")
    .update({
      indexed: true,
      commit_hash: commitHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", repoId);
  if (error) throw new Error(`Failed to mark repo indexed: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────
// File helpers
// ─────────────────────────────────────────────────────────────

/** Bulk insert file records for a repo (deletes existing first) */
export async function upsertFiles(
  repoId: string,
  files: Array<{ path: string; size_bytes: number; language: string | null }>
): Promise<DbFile[]> {
  const db = getSupabaseAdmin();

  // Clear old files for this repo
  await db.from("files").delete().eq("repo_id", repoId);

  const rows = files.map((f) => ({
    repo_id: repoId,
    path: f.path,
    size_bytes: f.size_bytes,
    language: f.language,
    chunk_count: 0,
  }));

  // Insert in batches of 200
  const results: DbFile[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { data, error } = await db.from("files").insert(batch).select("*");
    if (error) throw new Error(`Failed to insert files: ${error.message}`);
    results.push(...(data ?? []));
  }

  return results;
}

/** Update chunk_count on a file record */
export async function updateFileChunkCount(fileId: string, chunkCount: number): Promise<void> {
  const db = getSupabaseAdmin();
  await db.from("files").update({ chunk_count: chunkCount }).eq("id", fileId);
}

// ─────────────────────────────────────────────────────────────
// Chunk helpers
// ─────────────────────────────────────────────────────────────

/** Delete all chunks for a repo (used before re-indexing) */
export async function deleteChunksForRepo(repoId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("chunks").delete().eq("repo_id", repoId);
  if (error) throw new Error(`Failed to delete chunks: ${error.message}`);
}

/** Bulk insert chunks with embeddings */
export async function insertChunks(
  chunks: Array<{
    repo_id: string;
    file_id: string;
    file_path: string;
    chunk_index: number;
    chunk_text: string;
    embedding: number[];
    token_count?: number;
  }>
): Promise<number> {
  const db = getSupabaseAdmin();

  // Insert in batches of 100 to stay within Supabase payload limits
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += 100) {
    const batch = chunks.slice(i, i + 100);
    const { error } = await db.from("chunks").insert(batch);
    if (error) throw new Error(`Chunk insert failed at batch ${i}: ${error.message}`);
    inserted += batch.length;
  }

  return inserted;
}

// ─────────────────────────────────────────────────────────────
// Retrieval — Vector Search
// ─────────────────────────────────────────────────────────────

/** Run cosine similarity search via the match_chunks Postgres RPC */
export async function matchChunks(
  queryEmbedding: number[],
  repoId: string,
  matchCount = 5
): Promise<ChunkMatch[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    target_repo_id: repoId,
    match_count: matchCount,
  });

  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return (data as ChunkMatch[]) ?? [];
}

// ─────────────────────────────────────────────────────────────
// Retrieval — Keyword Search (BM25-style via Postgres ts_rank)
// ─────────────────────────────────────────────────────────────

/**
 * Full-text keyword search using Postgres tsvector.
 * Requires migration 003_hybrid_search.sql to be applied.
 * Falls back gracefully if the RPC is not available.
 */
export async function keywordSearchChunks(
  queryText: string,
  repoId: string,
  matchCount = 10
): Promise<KeywordMatch[]> {
  const db = getSupabaseAdmin();
  try {
    const { data, error } = await db.rpc("keyword_search_chunks", {
      query_text: queryText,
      target_repo_id: repoId,
      match_count: matchCount,
    });

    if (error) {
      // Graceful fallback: if RPC doesn't exist yet, return empty
      console.warn(`[Keyword Search] RPC failed (migration applied?): ${error.message}`);
      return [];
    }
    return (data as KeywordMatch[]) ?? [];
  } catch (err) {
    console.warn(
      `[Keyword Search] Failed: ${err instanceof Error ? err.message : err}`
    );
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Retrieval — Vector-Only Search (Stable Mode)
// ─────────────────────────────────────────────────────────────

/**
 * Pure vector search with strict similarity floor.
 * This is the stable default — one DB call, no keyword noise.
 *
 * Returns results with similarity >= minSimilarity, capped by maxChunksPerFile.
 */
export async function vectorOnlySearchChunks(
  queryEmbedding: number[],
  repoId: string,
  options: {
    topK?: number;
    finalTopK?: number;
    maxChunksPerFile?: number;
    minSimilarity?: number;
  } = {}
): Promise<HybridMatch[]> {
  const {
    topK = 20,
    finalTopK = 10,
    maxChunksPerFile = 3,
    minSimilarity = 0.30,
  } = options;

  const vectorResults = await matchChunks(queryEmbedding, repoId, topK);

  // Filter by similarity floor
  const filtered = vectorResults.filter((c) => c.similarity >= minSimilarity);

  // Apply diversity filter: limit chunks per file
  const fileCounts = new Map<string, number>();
  const diverseResults: HybridMatch[] = [];

  for (const chunk of filtered) {
    const count = fileCounts.get(chunk.file_path) ?? 0;
    if (count >= maxChunksPerFile) continue;

    fileCounts.set(chunk.file_path, count + 1);
    diverseResults.push({
      id: chunk.id,
      file_path: chunk.file_path,
      chunk_text: chunk.chunk_text,
      chunk_index: chunk.chunk_index,
      score: chunk.similarity,
      vectorRank: diverseResults.length + 1,
      keywordRank: 0,
    });

    if (diverseResults.length >= finalTopK) break;
  }

  console.log(
    `[Vector Search] fetched=${vectorResults.length} above_floor=${filtered.length} ` +
      `final=${diverseResults.length} files=${fileCounts.size} ` +
      `min_sim=${minSimilarity} top_sim=${filtered[0]?.similarity?.toFixed(3) ?? "n/a"}`
  );

  return diverseResults;
}

// ─────────────────────────────────────────────────────────────
// Retrieval — Hybrid Search (Vector + Keyword + Diversity)
// ─────────────────────────────────────────────────────────────

/**
 * Reciprocal Rank Fusion (RRF) scoring.
 *
 * Combines rankings from multiple retrieval systems into a single score.
 * RRF is simple, effective, and doesn't require score normalization.
 * Formula: score = Σ 1 / (k + rank_i)  where k = 60 (constant)
 *
 * @see https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
 */
const RRF_K = 60;

interface HybridSearchOptions {
  /** Number of vector search results to fetch (default: 15) */
  vectorTopK?: number;
  /** Number of keyword search results to fetch (default: 10) */
  keywordTopK?: number;
  /** Maximum chunks to return after fusion (default: 10) */
  finalTopK?: number;
  /** Maximum chunks allowed per file for diversity (default: 3) */
  maxChunksPerFile?: number;
  /** Minimum similarity threshold for vector results (default: 0.30) */
  minSimilarity?: number;
}

/**
 * Hybrid retrieval: vector search + keyword search merged via RRF.
 *
 * Pipeline:
 *  1. Run vector search (top-15) and keyword search (top-10) in parallel
 *  2. Merge results using Reciprocal Rank Fusion (RRF)
 *  3. Deduplicate by chunk ID
 *  4. Apply diversity filter (max N chunks per file)
 *  5. Return top-K final results sorted by combined score
 *
 * Falls back to pure vector search if keyword search is unavailable.
 */
export async function hybridSearchChunks(
  queryEmbedding: number[],
  queryText: string,
  repoId: string,
  options: HybridSearchOptions = {}
): Promise<HybridMatch[]> {
  const {
    vectorTopK = 15,
    keywordTopK = 10,
    finalTopK = 10,
    maxChunksPerFile = 3,
    minSimilarity = 0.30,
  } = options;

  // ── 1. Parallel retrieval ──────────────────────────────────
  const [vectorResults, keywordResults] = await Promise.all([
    matchChunks(queryEmbedding, repoId, vectorTopK),
    keywordSearchChunks(queryText, repoId, keywordTopK),
  ]);

  // ── 2. Build RRF score map ─────────────────────────────────
  const scoreMap = new Map<
    number,
    {
      id: number;
      file_path: string;
      chunk_text: string;
      chunk_index: number;
      score: number;
      vectorRank: number;
      keywordRank: number;
    }
  >();

  // Score vector results
  for (let i = 0; i < vectorResults.length; i++) {
    const chunk = vectorResults[i];
    // Skip low-similarity results
    if (chunk.similarity < minSimilarity) continue;

    const vectorRank = i + 1;
    const rrfScore = 1 / (RRF_K + vectorRank);

    scoreMap.set(chunk.id, {
      id: chunk.id,
      file_path: chunk.file_path,
      chunk_text: chunk.chunk_text,
      chunk_index: chunk.chunk_index,
      score: rrfScore,
      vectorRank,
      keywordRank: 0,
    });
  }

  // Add keyword results (additive RRF)
  // IMPORTANT: Keyword-only matches (not in vector results) are DISCOUNTED
  // because they may be topically irrelevant. Only chunks appearing in BOTH
  // retrieval systems get their full score boost.
  for (let i = 0; i < keywordResults.length; i++) {
    const chunk = keywordResults[i];
    const keywordRank = i + 1;
    const rrfScore = 1 / (RRF_K + keywordRank);

    const existing = scoreMap.get(chunk.id);
    if (existing) {
      // Chunk appears in BOTH vector + keyword → full boost (high confidence)
      existing.score += rrfScore;
      existing.keywordRank = keywordRank;
    } else {
      // Keyword-only match → discount by 50% to prevent noise promotion
      // These lack semantic validation and can inject irrelevant code
      scoreMap.set(chunk.id, {
        id: chunk.id,
        file_path: chunk.file_path,
        chunk_text: chunk.chunk_text,
        chunk_index: chunk.chunk_index,
        score: rrfScore * 0.5,  // discounted — no vector backing
        vectorRank: 0,
        keywordRank,
      });
    }
  }

  // ── 3. Sort by combined score ──────────────────────────────
  const merged = Array.from(scoreMap.values())
    // Filter out tiny/empty chunks at the retrieval layer
    .filter((c) => c.chunk_text.trim().length >= 40)
    .sort((a, b) => b.score - a.score);

  // ── 4. Diversity filter: limit chunks per file ─────────────
  const fileCounts = new Map<string, number>();
  const diverseResults: HybridMatch[] = [];

  for (const chunk of merged) {
    const count = fileCounts.get(chunk.file_path) ?? 0;
    if (count >= maxChunksPerFile) continue;

    fileCounts.set(chunk.file_path, count + 1);
    diverseResults.push(chunk);

    if (diverseResults.length >= finalTopK) break;
  }

  console.log(
    `[Hybrid Search] vector=${vectorResults.length} keyword=${keywordResults.length} ` +
      `merged=${merged.length} final=${diverseResults.length} ` +
      `files=${fileCounts.size}`
  );

  return diverseResults;
}

// ─────────────────────────────────────────────────────────────
// Retrieval — Unified Search (routes by mode)
// ─────────────────────────────────────────────────────────────

export type RetrievalMode = "vector" | "hybrid";

export interface RetrievalResult {
  chunks: HybridMatch[];
  /** Average similarity/score of the top-5 results (0–1) */
  confidence: number;
  /** How many chunks survived filtering */
  totalRetrieved: number;
  mode: RetrievalMode;
}

/**
 * Unified retrieval entry point — routes to vector-only or hybrid based on mode.
 * Returns chunks + a confidence score for downstream quality decisions.
 */
export async function searchChunks(
  queryEmbedding: number[],
  queryText: string,
  repoId: string,
  mode: RetrievalMode = "vector"
): Promise<RetrievalResult> {
  const chunks =
    mode === "hybrid"
      ? await hybridSearchChunks(queryEmbedding, queryText, repoId, {
          minSimilarity: 0.30,
        })
      : await vectorOnlySearchChunks(queryEmbedding, repoId, {
          minSimilarity: 0.30,
        });

  // Compute confidence = average score of top-5 results
  const topScores = chunks.slice(0, 5).map((c) => c.score);
  const confidence =
    topScores.length > 0
      ? topScores.reduce((a, b) => a + b, 0) / topScores.length
      : 0;

  return {
    chunks,
    confidence,
    totalRetrieved: chunks.length,
    mode,
  };
}

// ─────────────────────────────────────────────────────────────
// Retrieval — Full-File Fallback (DB-based)
// ─────────────────────────────────────────────────────────────

/**
 * Retrieve all chunks for a specific file path from the DB and concatenate.
 * Used as a fallback when the user asks about a specific file but RAG
 * only returned fragments or nothing relevant.
 */
export async function getFullFileChunks(
  repoId: string,
  filePath: string
): Promise<{ file_path: string; chunk_text: string } | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("chunks")
    .select("chunk_text, chunk_index")
    .eq("repo_id", repoId)
    .eq("file_path", filePath)
    .order("chunk_index", { ascending: true });

  if (error || !data || data.length === 0) {
    return null;
  }

  // Concatenate all chunks for this file, stripping chunk headers
  const fullText = data
    .map((c: { chunk_text: string }) => {
      // Remove the semantic header line (e.g., "[path :: chunk N/M, lines X-Y]")
      const lines = c.chunk_text.split("\n");
      const firstLine = lines[0] ?? "";
      if (firstLine.startsWith("[") && firstLine.includes("::")) {
        return lines.slice(1).join("\n");
      }
      return c.chunk_text;
    })
    .join("\n");

  return {
    file_path: filePath,
    chunk_text: fullText.trim(),
  };
}

// ─────────────────────────────────────────────────────────────
// Indexing Job helpers
// ─────────────────────────────────────────────────────────────

/** Create a new indexing job in `pending` state */
export async function createIndexingJob(
  repoId: string,
  userId: string
): Promise<DbIndexingJob> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("indexing_jobs")
    .insert({
      repo_id: repoId,
      user_id: userId,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create indexing job: ${error.message}`);
  return data;
}

/** Transition job to `indexing` state */
export async function startIndexingJob(
  jobId: string,
  totalFiles: number
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("indexing_jobs")
    .update({
      status: "indexing",
      total_files: totalFiles,
      started_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`Failed to start indexing job: ${error.message}`);
}

/** Update progress on an active indexing job */
export async function updateIndexingProgress(
  jobId: string,
  processedFiles: number,
  totalChunks: number
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("indexing_jobs")
    .update({
      processed_files: processedFiles,
      total_chunks: totalChunks,
    })
    .eq("id", jobId);
  if (error) throw new Error(`Failed to update indexing progress: ${error.message}`);
}

/** Mark job as completed */
export async function completeIndexingJob(
  jobId: string,
  totalChunks: number
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("indexing_jobs")
    .update({
      status: "completed",
      total_chunks: totalChunks,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`Failed to complete indexing job: ${error.message}`);
}

/** Mark job as failed with error message */
export async function failIndexingJob(
  jobId: string,
  errorMessage: string
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("indexing_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`Failed to fail indexing job: ${error.message}`);
}

/** Get the latest indexing job for a repo */
export async function getLatestIndexingJob(
  repoId: string
): Promise<DbIndexingJob | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("indexing_jobs")
    .select("*")
    .eq("repo_id", repoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data ?? null;
}

/** Check if any job is currently active (pending or indexing) for a repo */
export async function hasActiveIndexingJob(repoId: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("indexing_jobs")
    .select("id")
    .eq("repo_id", repoId)
    .in("status", ["pending", "indexing"])
    .limit(1);
  return (data?.length ?? 0) > 0;
}
