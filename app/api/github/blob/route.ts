import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchFileContent, getLanguageFromPath } from "@/lib/github";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const branch = searchParams.get("branch");
  const path = searchParams.get("path");

  if (!owner || !repo || !branch || !path) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  try {
    const content = await fetchFileContent(
      owner,
      repo,
      branch,
      path,
      session.accessToken
    );

    return NextResponse.json({
      content,
      language: getLanguageFromPath(path),
      path,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
