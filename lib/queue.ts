import { Queue, Worker, Job } from "bullmq";
import { getRedis } from "./redis";

/**
 * BullMQ job queue for background indexing.
 *
 * Architecture:
 *  - API route creates a job → returns immediately with jobId
 *  - Worker process picks up the job → runs indexing pipeline
 *  - Frontend polls /api/ai/index/status for progress
 *
 * This replaces the old synchronous indexing that blocked the API
 * route for 2-4 minutes on large repos.
 */

// ─────────────────────────────────────────────────────────────
// Queue Name
// ─────────────────────────────────────────────────────────────

export const INDEX_QUEUE_NAME = "indexing";

// ─────────────────────────────────────────────────────────────
// Job Types
// ─────────────────────────────────────────────────────────────

export interface IndexJobData {
  userId: string;
  owner: string;
  repo: string;
  branch: string;
  accessToken: string;
  userEmail?: string | null;
  userAvatar?: string | null;
  githubLogin: string;
}

export interface IndexJobResult {
  repoId: string;
  jobId: string;
  filesProcessed: number;
  chunksCreated: number;
  skipped: number;
}

// ─────────────────────────────────────────────────────────────
// Queue Instance (singleton)
// ─────────────────────────────────────────────────────────────

let indexQueue: Queue<IndexJobData, IndexJobResult> | null = null;

/**
 * Get (or create) the indexing job queue.
 * Used by API routes to enqueue indexing jobs.
 */
export function getIndexQueue(): Queue<IndexJobData, IndexJobResult> {
  if (!indexQueue) {
    const connection = getRedis();
    indexQueue = new Queue<IndexJobData, IndexJobResult>(INDEX_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 3600 },  // keep completed jobs for 24h
        removeOnFail: { age: 7 * 24 * 3600 },  // keep failed jobs for 7 days
        attempts: 2,                             // retry once on failure
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    });
  }
  return indexQueue;
}

/**
 * Enqueue an indexing job. Returns immediately.
 * The job will be picked up by the worker process.
 */
export async function enqueueIndexJob(
  data: IndexJobData
): Promise<Job<IndexJobData, IndexJobResult>> {
  const queue = getIndexQueue();
  const jobId = `${data.owner}/${data.repo}/${Date.now()}`;

  const job = await queue.add("index-repo", data, {
    jobId,
    // Prevent duplicate concurrent jobs for the same repo
    // BullMQ will reject if a job with this ID already exists and is active
  });

  console.log(`[Queue] Enqueued indexing job: ${jobId}`);
  return job;
}

/**
 * Create a BullMQ worker for processing indexing jobs.
 * Called from the worker entry point (scripts/start-worker.ts).
 */
export function createIndexWorker(
  processor: (job: Job<IndexJobData, IndexJobResult>) => Promise<IndexJobResult>
): Worker<IndexJobData, IndexJobResult> {
  const connection = getRedis();

  const worker = new Worker<IndexJobData, IndexJobResult>(
    INDEX_QUEUE_NAME,
    processor,
    {
      connection,
      concurrency: 2,  // max 2 concurrent indexing jobs
      limiter: {
        max: 5,
        duration: 60_000,  // max 5 jobs per minute
      },
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed:`, job.returnvalue);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[Worker] Error:", err.message);
  });

  return worker;
}
