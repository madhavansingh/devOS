import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchRepoMeta, fetchRepoTree, buildFileTree } from "@/lib/github";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo query params" },
      { status: 400 }
    );
  }

  try {
    // 1. Get default branch from repo metadata
    const meta = await fetchRepoMeta(owner, repo, session.accessToken);

    // 2. Fetch the full recursive tree
    const flatItems = await fetchRepoTree(
      owner,
      repo,
      meta.defaultBranch,
      session.accessToken
    );

    // 3. Build the nested tree structure for the UI
    const tree = buildFileTree(flatItems);

    return NextResponse.json({
      meta,
      tree,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
