import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateEmbedding } from "@/lib/ollama";
import { searchChunks, RetrievalMode } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { query, repoId, mode = "hybrid" } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }
    if (!repoId || typeof repoId !== "string") {
      return NextResponse.json({ error: "Invalid repoId" }, { status: 400 });
    }

    // 1. Generate vector embedding for the search query
    const embedding = await generateEmbedding(query);

    // 2. Perform semantic search against the Supabase vector database
    const results = await searchChunks(
      embedding,
      query,
      repoId,
      mode as RetrievalMode
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("[Search API] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
