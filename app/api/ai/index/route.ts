import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { upsertUser, getRepository, getLatestIndexingJob, hasActiveIndexingJob } from "@/lib/supabase";
import {
  checkRateLimit,
  INDEX_LIMIT,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { enqueueIndexJob } from "@/lib/queue";

/**
 * POST /api/ai/index
 *
 * Triggers the full indexing pipeline for a repository.
 *
 * ARCHITECTURE (v2 — Async):
 *  1. Auth check + rate limit
 *  2. Quick DB checks (already indexed? active job?)
 *  3. Enqueue background job → return immediately
 *  4. Worker process handles the heavy lifting
 *  5. Frontend polls /api/ai/index/status for progress
 *
 * This replaces the old synchronous design that blocked for 2-4 minutes.
 *
 * @see project-docs/API.md §4.3
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit check (now Redis-backed)
  const userLogin = session.user.githubLogin;
  const rl = await checkRateLimit(userLogin, "index", INDEX_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Resets at ${new Date(rl.resetAt).toISOString()}` },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const body = await req.json();
  const { owner, repo } = body as { owner?: string; repo?: string };

  // ── Input validation ─────────────────────────────────────────
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo are required" },
      { status: 400 }
    );
  }

  // Validate owner/repo format (prevent path traversal)
  const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) {
    return NextResponse.json(
      { error: "Invalid owner or repo name" },
      { status: 400 }
    );
  }

  try {
    // ── 1. Ensure user exists in DB ──────────────────────────
    const user = await upsertUser({
      github_id: userLogin,
      github_login: userLogin,
      email: session.user.email,
      avatar_url: session.user.image,
    });

    // ── 2. Check if already indexed recently (< 1 hour) ──────
    const existingRepo = await getRepository(user.id, owner, repo);
    if (existingRepo?.indexed) {
      const lastJob = await getLatestIndexingJob(existingRepo.id);
      if (lastJob?.status === "completed" && lastJob.completed_at) {
        const completedAt = new Date(lastJob.completed_at).getTime();
        const hourAgo = Date.now() - 60 * 60 * 1000;
        if (completedAt > hourAgo) {
          return NextResponse.json({
            message: "Already indexed",
            repoId: existingRepo.id,
            chunkCount: lastJob.total_chunks,
          });
        }
      }
    }

    // ── 3. Check if there's an active job already ────────────
    if (existingRepo && await hasActiveIndexingJob(existingRepo.id)) {
      return NextResponse.json({
        message: "Indexing already in progress",
        repoId: existingRepo.id,
      });
    }

    // ── 4. Enqueue background job → return immediately ───────
    const job = await enqueueIndexJob({
      userId: user.id,
      owner,
      repo,
      branch: existingRepo?.default_branch ?? "main",
      accessToken: session.accessToken,
      githubLogin: userLogin,
      userEmail: session.user.email,
      userAvatar: session.user.image,
    });

    return NextResponse.json(
      {
        message: "Indexing queued",
        jobId: job.id,
        status: "pending",
      },
      { status: 202, headers: rateLimitHeaders(rl) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed";
    console.error("[/api/ai/index] Error:", message);

    // Sanitize error messages — don't leak internals
    const safeMessage = message.includes("ECONNREFUSED")
      ? "AI engine is offline. Please start Ollama and retry."
      : message.includes("Supabase") || message.includes("Redis")
        ? "Service temporarily unavailable. Please retry."
        : "Indexing failed. Please try again.";

    const status = message.includes("ECONNREFUSED") ? 502 : 500;
    return NextResponse.json({ error: safeMessage }, { status });
  }
}
