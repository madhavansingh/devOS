import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getRepository,
  getLatestIndexingJob,
  upsertUser,
} from "@/lib/supabase";
import { getCachedUser, setCachedUser } from "@/lib/cache";

/**
 * GET /api/ai/index/status?owner=...&repo=...
 *
 * Returns the current indexing status for a repository.
 * Used by the frontend to poll for progress during async indexing.
 *
 * Response:
 *   - { indexed: false, status: null } — never indexed
 *   - { indexed: false, status: "pending", progress: { ... } } — job queued
 *   - { indexed: false, status: "indexing", progress: { ... } } — in progress
 *   - { indexed: true, status: "completed", progress: { ... } } — done
 *   - { indexed: false, status: "failed", error: "..." } — failed
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo query params required" },
      { status: 400 }
    );
  }

  try {
    // Cached user lookup (avoids DB write on every poll)
    const userLogin = session.user.githubLogin;
    let user = await getCachedUser(userLogin);
    if (!user) {
      const dbUser = await upsertUser({
        github_id: userLogin,
        github_login: userLogin,
        email: session.user.email,
        avatar_url: session.user.image,
      });
      user = { id: dbUser.id };
      await setCachedUser(userLogin, user);
    }

    const repoRecord = await getRepository(user.id, owner, repo);

    if (!repoRecord) {
      return NextResponse.json({
        indexed: false,
        status: null,
        message: "Repository not found",
      });
    }

    const latestJob = await getLatestIndexingJob(repoRecord.id);

    if (!latestJob) {
      return NextResponse.json({
        indexed: repoRecord.indexed,
        status: null,
        repoId: repoRecord.id,
      });
    }

    return NextResponse.json({
      indexed: repoRecord.indexed,
      status: latestJob.status,
      repoId: repoRecord.id,
      jobId: latestJob.id,
      progress: {
        totalFiles: latestJob.total_files,
        processedFiles: latestJob.processed_files,
        totalChunks: latestJob.total_chunks,
      },
      error: latestJob.error_message,
      startedAt: latestJob.started_at,
      completedAt: latestJob.completed_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status check failed";
    console.error("[/api/ai/index/status] Error:", message);
    // Sanitize error output
    return NextResponse.json(
      { error: "Status check failed. Please retry." },
      { status: 500 }
    );
  }
}

