import { generateEmbeddingsBatch } from "./ollama";
import { getLanguageFromPath } from "./github";
import {
  upsertRepository,
  upsertFiles,
  deleteChunksForRepo,
  insertChunks,
  updateFileChunkCount,
  markRepoIndexed,
  createIndexingJob,
  startIndexingJob,
  updateIndexingProgress,
  completeIndexingJob,
  failIndexingJob,
  hasActiveIndexingJob,
  DbFile,
} from "./supabase";

/**
 * Repository Indexing Pipeline — v2 (Smart Chunking)
 *
 * Stages: Trigger → Parse → Smart Chunk → Embed → Store
 *
 * v2 Changes:
 *  - AST-aware chunking: splits by functions, classes, and logical blocks
 *  - Semantic chunk headers for better embedding quality
 *  - Smaller, focused chunks (40–60 lines) with 5-line overlap
 *  - Config file detection (short files kept as single chunks)
 *
 * @see project-docs/Database.md §6 — Indexing Pipeline
 */

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SMART_CHUNK_MAX_LINES = 60;   // max lines per chunk
const SMART_CHUNK_MIN_LINES = 15;   // min lines before creating a chunk (raised from 8 to prevent tiny fragments)
const SMART_CHUNK_TARGET_LINES = 45; // preferred chunk size — merge small blocks up to this
const SMART_CHUNK_OVERLAP = 5;      // overlap lines between chunks
const SMALL_FILE_THRESHOLD = 50;    // files ≤ this many lines stay as one chunk (raised from 40)
const MAX_FILE_SIZE_BYTES = 60_000; // skip files > 60KB
const MAX_FILES_TO_INDEX = 300;     // cap total files indexed

// Extensions to skip (binaries, lock files, generated assets)
const SKIP_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "avif",
  "woff", "woff2", "ttf", "eot",
  "mp4", "mp3", "wav",
  "pdf", "zip", "tar", "gz",
  "lock", "sum",
  "min.js", "min.css",
  "map",
]);

const SKIP_PATHS = [
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  "vendor", "__pycache__", ".venv", ".cache", ".turbo",
];

// Config/data files that don't have function boundaries
const CONFIG_EXTENSIONS = new Set([
  "json", "yaml", "yml", "toml", "ini", "env", "xml", "csv",
  "md", "txt", "rst", "lock",
]);

// ─────────────────────────────────────────────────────────────
// Stage 1: File Parsing / Filtering
// ─────────────────────────────────────────────────────────────

function shouldSkipFile(filePath: string, size?: number): boolean {
  if (size && size > MAX_FILE_SIZE_BYTES) return true;
  const lower = filePath.toLowerCase();
  if (SKIP_PATHS.some((p) => lower.includes(`/${p}/`) || lower.startsWith(`${p}/`))) return true;
  const ext = lower.split(".").pop() ?? "";
  return SKIP_EXTENSIONS.has(ext);
}

// ─────────────────────────────────────────────────────────────
// Stage 2: Smart Chunking (AST-aware)
// ─────────────────────────────────────────────────────────────

export interface TextChunk {
  filePath: string;
  chunkIndex: number;
  text: string;
  tokenEstimate: number;
}

/**
 * Detect block boundaries in source code.
 *
 * Identifies lines that start a new logical block:
 *  - function/method declarations
 *  - class/interface/type/enum declarations
 *  - export statements with declarations
 *  - top-level `describe`/`it`/`test` blocks
 *  - comment headers (e.g. `// ───` section dividers)
 *
 * Returns an array of line indices (0-based) that are block boundaries.
 */
function detectBlockBoundaries(lines: string[]): number[] {
  const boundaries: number[] = [0]; // always start with line 0

  // Patterns that indicate a new logical block
  const BLOCK_PATTERNS = [
    // Functions and methods (JS/TS/Python/Go/Rust/Java/C)
    /^\s*(?:export\s+)?(?:async\s+)?(?:function|def|fn|func)\s+\w/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
    /^\s*(?:public|private|protected|static|async)\s+(?:[\w<>[\]]+\s+)?\w+\s*\(/,

    // Classes, interfaces, types, enums
    /^\s*(?:export\s+)?(?:abstract\s+)?(?:class|interface|type|enum|struct|trait|impl)\s+\w/,

    // Export blocks
    /^\s*export\s+(?:default\s+)?(?:class|function|const|interface|type|enum)\s/,

    // Test blocks
    /^\s*(?:describe|it|test|beforeEach|afterEach|beforeAll|afterAll)\s*\(/,

    // Section comment dividers (e.g., // ─────── or # =======)
    /^\s*(?:\/\/|#)\s*[─═━─\-=]{4,}/,

    // Python decorators (mark the decorator line as boundary)
    /^\s*@\w+/,

    // Go/Rust struct and impl blocks
    /^\s*(?:type\s+\w+\s+struct|impl\s)/,
  ];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip empty lines and pure-comment lines for boundary detection
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.test(line)) {
        // Don't add adjacent boundaries (within 3 lines of last)
        const lastBoundary = boundaries[boundaries.length - 1];
        if (i - lastBoundary >= SMART_CHUNK_MIN_LINES) {
          boundaries.push(i);
        }
        break;
      }
    }
  }

  return boundaries;
}

/**
 * Smart-chunk a file's content using detected block boundaries.
 *
 * Strategy:
 *  1. Small files (≤ SMALL_FILE_THRESHOLD lines): return as single chunk
 *  2. Config/data files: return as single chunk
 *  3. Source code: detect block boundaries, chunk at boundaries,
 *     merge tiny blocks, split oversized blocks
 *  4. Each chunk gets a semantic header: `[file_path :: chunk N]`
 */
export function chunkText(
  text: string,
  filePath: string,
): TextChunk[] {
  const lines = text.split("\n");
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  // ── Small files or config files → single chunk ──
  if (lines.length <= SMALL_FILE_THRESHOLD || CONFIG_EXTENSIONS.has(ext)) {
    const content = text.trim();
    if (!content) return [];
    return [
      {
        filePath,
        chunkIndex: 0,
        text: `[${filePath}]\n${content}`,
        tokenEstimate: Math.ceil(content.length / 4),
      },
    ];
  }

  // ── Source code → AST-aware chunking ──
  const boundaries = detectBlockBoundaries(lines);
  const rawSegments: Array<{ start: number; end: number }> = [];

  // Create segments from boundary pairs
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
    rawSegments.push({ start, end });
  }

  // ── Merge tiny segments + split oversized ones ──
  const mergedSegments: Array<{ start: number; end: number }> = [];
  let pending: { start: number; end: number } | null = null;

  for (const seg of rawSegments) {
    const segLen = seg.end - seg.start;

    if (!pending) {
      pending = { ...seg };
      continue;
    }

    const pendingLen = pending.end - pending.start;

    // If merging would stay under max, merge
    if (pendingLen + segLen <= SMART_CHUNK_TARGET_LINES) {
      pending.end = seg.end;
    } else {
      // Flush pending
      mergedSegments.push(pending);
      pending = { ...seg };
    }
  }
  if (pending) mergedSegments.push(pending);

  // ── Split any remaining oversized segments ──
  const finalSegments: Array<{ start: number; end: number }> = [];
  for (const seg of mergedSegments) {
    const segLen = seg.end - seg.start;
    if (segLen <= SMART_CHUNK_MAX_LINES) {
      finalSegments.push(seg);
    } else {
      // Linear split with overlap
      let s = seg.start;
      while (s < seg.end) {
        const e = Math.min(s + SMART_CHUNK_MAX_LINES, seg.end);
        finalSegments.push({ start: s, end: e });
        s += SMART_CHUNK_MAX_LINES - SMART_CHUNK_OVERLAP;
      }
    }
  }

  // ── Build chunks with semantic headers ──
  const chunks: TextChunk[] = [];
  for (let i = 0; i < finalSegments.length; i++) {
    const seg = finalSegments[i];
    const chunkLines = lines.slice(seg.start, seg.end);
    const chunkContent = chunkLines.join("\n").trim();

    if (!chunkContent || chunkContent.length < 80) continue; // raised from 20 to filter out noise fragments

    // Semantic header helps embeddings associate chunk with file context
    const header = `[${filePath} :: chunk ${i + 1}/${finalSegments.length}, lines ${seg.start + 1}-${seg.end}]`;

    chunks.push({
      filePath,
      chunkIndex: i,
      text: `${header}\n${chunkContent}`,
      tokenEstimate: Math.ceil(chunkContent.length / 4),
    });
  }

  return chunks;
}

// ─────────────────────────────────────────────────────────────
// Full Pipeline
// ─────────────────────────────────────────────────────────────

export interface FileToIndex {
  path: string;
  content: string;
  size?: number;
}

export interface IndexingResult {
  repoId: string;
  jobId: string;
  filesProcessed: number;
  chunksCreated: number;
  skipped: number;
}

/**
 * Index an entire repository into Supabase pgvector.
 *
 * Pipeline stages:
 *  1. Validate — Check for active jobs, upsert repo record
 *  2. Parse   — Filter files by extension/size/path rules
 *  3. Chunk   — Smart-split each file by logical blocks
 *  4. Embed   — Generate 768-dim vectors via Ollama (nomic-embed-text)
 *  5. Store   — Insert chunks + embeddings into Supabase
 *
 * Status tracking via `indexing_jobs`:
 *  pending → indexing → completed | failed
 */
export async function indexRepository(
  userId: string,
  owner: string,
  repo: string,
  branch: string,
  commitHash: string,
  files: FileToIndex[],
  repoMeta?: { description?: string | null; stars?: number; language?: string | null }
): Promise<IndexingResult> {
  // ── 1. Validate & setup ──────────────────────────────────

  // Upsert the repository record
  const repoRecord = await upsertRepository(userId, {
    owner,
    name: repo,
    default_branch: branch,
    commit_hash: commitHash,
    description: repoMeta?.description,
    stars: repoMeta?.stars,
    language: repoMeta?.language,
  });

  // Check for existing active job
  const hasActive = await hasActiveIndexingJob(repoRecord.id);
  if (hasActive) {
    throw new Error("An indexing job is already in progress for this repository.");
  }

  // Create the job
  const job = await createIndexingJob(repoRecord.id, userId);

  try {
    // ── 2. Parse / filter files ──────────────────────────────
    const eligible = files
      .filter((f) => !shouldSkipFile(f.path, f.size))
      .slice(0, MAX_FILES_TO_INDEX);
    const skipped = files.length - eligible.length;

    // Transition to indexing
    await startIndexingJob(job.id, eligible.length);

    if (eligible.length === 0) {
      await completeIndexingJob(job.id, 0);
      await markRepoIndexed(repoRecord.id, commitHash);
      return {
        repoId: repoRecord.id,
        jobId: job.id,
        filesProcessed: 0,
        chunksCreated: 0,
        skipped,
      };
    }

    // ── 3. Insert file records & smart-chunk all files ───────
    const fileRecords = await upsertFiles(
      repoRecord.id,
      eligible.map((f) => ({
        path: f.path,
        size_bytes: f.size ?? f.content.length,
        language: getLanguageFromPath(f.path),
      }))
    );

    // Build a map: path → DbFile for FK linkage
    const fileMap = new Map<string, DbFile>();
    for (const fr of fileRecords) {
      fileMap.set(fr.path, fr);
    }

    // Smart-chunk all files
    const allChunks: Array<TextChunk & { fileId: string }> = [];
    for (const file of eligible) {
      const fileRecord = fileMap.get(file.path);
      if (!fileRecord) continue;

      const chunks = chunkText(file.content, file.path);
      for (const chunk of chunks) {
        allChunks.push({ ...chunk, fileId: fileRecord.id });
      }

      // Update chunk count on file record
      await updateFileChunkCount(fileRecord.id, chunks.length);
    }

    // ── 4. Generate embeddings in batches ────────────────────
    const texts = allChunks.map((c) => c.text);
    const embeddings = await generateEmbeddingsBatch(texts, 5);

    // Update progress mid-way
    await updateIndexingProgress(job.id, eligible.length, allChunks.length);

    // ── 5. Store chunks + embeddings ─────────────────────────
    // Delete old chunks first
    await deleteChunksForRepo(repoRecord.id);

    const chunkRows = allChunks.map((chunk, i) => ({
      repo_id: repoRecord.id,
      file_id: chunk.fileId,
      file_path: chunk.filePath,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.text,
      embedding: embeddings[i],
      token_count: chunk.tokenEstimate,
    }));

    const insertedCount = await insertChunks(chunkRows);

    // ── Finalize ─────────────────────────────────────────────
    await completeIndexingJob(job.id, insertedCount);
    await markRepoIndexed(repoRecord.id, commitHash);

    return {
      repoId: repoRecord.id,
      jobId: job.id,
      filesProcessed: eligible.length,
      chunksCreated: insertedCount,
      skipped,
    };
  } catch (err) {
    // Mark job as failed
    const message = err instanceof Error ? err.message : "Unknown indexing error";
    await failIndexingJob(job.id, message);
    throw err;
  }
}
