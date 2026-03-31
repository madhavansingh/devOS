import { Job } from "bullmq";
import pLimit from "p-limit";
import {
  createIndexWorker,
  IndexJobData,
  IndexJobResult,
} from "@/lib/queue";
import { fetchRepoMeta, fetchRepoTree, fetchFileContent } from "@/lib/github";
import { indexRepository } from "@/lib/embeddings";
import { upsertUser, getRepository, getLatestIndexingJob } from "@/lib/supabase";
import { invalidateRepoCache } from "@/lib/cache";

/**
 * Background indexing worker process.
 *
 * Run separately from the Next.js server:
 *   npx tsx workers/indexer/worker.ts
 *
 * This worker:
 *  1. Picks up "index-repo" jobs from BullMQ
 *  2. Fetches repo files from GitHub (concurrency-limited)
 *  3. Runs the chunking + embedding pipeline
 *  4. Stores results in Supabase pgvector
 *  5. Invalidates relevant caches
 */

const MAX_FILES_TO_FETCH = 300;

// Limit concurrent GitHub API requests to avoid rate limiting
const githubFetchLimit = pLimit(10);

async function processIndexJob(
  job: Job<IndexJobData, IndexJobResult>
): Promise<IndexJobResult> {
  const { userId, owner, repo, accessToken, githubLogin, userEmail, userAvatar } = job.data;

  console.log(`[Worker] Processing: ${owner}/${repo} for ${githubLogin}`);
  await job.updateProgress(5);

  // ── 1. Ensure user exists ──────────────────────────────────
  const user = await upsertUser({
    github_id: githubLogin,
    github_login: githubLogin,
    email: userEmail,
    avatar_url: userAvatar,
  });

  // ── 2. Fetch repo metadata ─────────────────────────────────
  const meta = await fetchRepoMeta(owner, repo, accessToken);
  await job.updateProgress(10);

  // ── 3. Check if recently indexed (< 1 hour) ───────────────
  const existingRepo = await getRepository(user.id, owner, repo);
  if (existingRepo?.indexed) {
    const lastJob = await getLatestIndexingJob(existingRepo.id);
    if (lastJob?.status === "completed" && lastJob.completed_at) {
      const completedAt = new Date(lastJob.completed_at).getTime();
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (completedAt > hourAgo) {
        console.log(`[Worker] ${owner}/${repo} already indexed within last hour, skipping`);
        return {
          repoId: existingRepo.id,
          jobId: lastJob.id,
          filesProcessed: lastJob.total_files,
          chunksCreated: lastJob.total_chunks,
          skipped: 0,
        };
      }
    }
  }

  // ── 4. Fetch flat tree from GitHub ─────────────────────────
  const treeItems = await fetchRepoTree(owner, repo, meta.defaultBranch, accessToken);
  const blobItems = treeItems
    .filter((item) => item.type === "blob")
    .slice(0, MAX_FILES_TO_FETCH);

  await job.updateProgress(20);
  console.log(`[Worker] ${owner}/${repo}: fetching ${blobItems.length} files`);

  // ── 5. Fetch file contents (CONCURRENCY-LIMITED to 10) ─────
  const fileResults = await Promise.allSettled(
    blobItems.map((item) =>
      githubFetchLimit(async () => ({
        path: item.path,
        content: await fetchFileContent(
          owner,
          repo,
          meta.defaultBranch,
          item.path,
          accessToken
        ),
        size: item.size,
      }))
    )
  );

  const validFiles = fileResults
    .filter((r) => r.status === "fulfilled")
    .map(
      (r) =>
        (r as PromiseFulfilledResult<{ path: string; content: string; size?: number }>).value
    );

  await job.updateProgress(50);
  console.log(`[Worker] ${owner}/${repo}: ${validFiles.length} files fetched, starting indexing`);

  // ── 6. Run full indexing pipeline ──────────────────────────
  const result = await indexRepository(
    user.id,
    owner,
    repo,
    meta.defaultBranch,
    treeItems[0]?.sha ?? "unknown",
    validFiles,
    {
      description: meta.description,
      stars: meta.stars,
      language: meta.language,
    }
  );

  // ── 7. Invalidate caches for this repo ─────────────────────
  await invalidateRepoCache(result.repoId);

  await job.updateProgress(100);
  console.log(
    `[Worker] ${owner}/${repo}: done — ${result.filesProcessed} files, ${result.chunksCreated} chunks`
  );

  return result;
}

// ─────────────────────────────────────────────────────────────
// Start the worker
// ─────────────────────────────────────────────────────────────

console.log("[Worker] Starting indexing worker...");

const worker = createIndexWorker(processIndexJob);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received, shutting down gracefully...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Worker] SIGINT received, shutting down gracefully...");
  await worker.close();
  process.exit(0);
});
