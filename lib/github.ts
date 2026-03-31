import { FileNode, GitTreeItem, RepoMeta } from "@/types/github";

const GITHUB_API = "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";

/** Build auth headers from a user's GitHub access token */
function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ─────────────────────────────────────────────────────────────
// Repo Metadata
// ─────────────────────────────────────────────────────────────

/** Fetch basic metadata for a repository */
export async function fetchRepoMeta(
  owner: string,
  repo: string,
  token: string
): Promise<RepoMeta> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: authHeaders(token),
    next: { revalidate: 60 }, // cache for 60s
  });

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    owner,
    name: repo,
    defaultBranch: data.default_branch,
    description: data.description,
    stars: data.stargazers_count,
    language: data.language,
  };
}

// ─────────────────────────────────────────────────────────────
// File Tree
// ─────────────────────────────────────────────────────────────

/** Download the full recursive file tree for a repo */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<GitTreeItem[]> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, {
    headers: authHeaders(token),
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch tree: ${res.status}`);
  }

  const data = await res.json();

  // Filter out git internal files; keep blobs and trees under 1000 nodes for MVP
  return (data.tree as GitTreeItem[]).filter(
    (item) => item.type === "blob" || item.type === "tree"
  );
}

/**
 * Convert a flat GitTreeItem[] (from GitHub's recursive API)
 * into a nested FileNode[] tree for the UI.
 */
export function buildFileTree(items: GitTreeItem[]): FileNode[] {
  const root: FileNode[] = [];
  const map: Record<string, FileNode> = {};

  // Sort so folders come before files. Within each level, sort alphabetically.
  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const item of sorted) {
    const parts = item.path.split("/");
    const name = parts[parts.length - 1];

    const node: FileNode = {
      name,
      path: item.path,
      type: item.type === "tree" ? "folder" : "file",
      children: item.type === "tree" ? [] : undefined,
    };

    map[item.path] = node;

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = map[parentPath];
      if (parent?.children) {
        parent.children.push(node);
      }
    }
  }

  return root;
}

// ─────────────────────────────────────────────────────────────
// File Content
// ─────────────────────────────────────────────────────────────

/**
 * Fetch raw file content from raw.githubusercontent.com.
 * Falls back to the GitHub API blob endpoint if the raw URL fails
 * (e.g., for private repos).
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  token: string
): Promise<string> {
  // Try the public raw CDN first (fastest)
  const rawUrl = `${RAW_BASE}/${owner}/${repo}/${branch}/${filePath}`;
  const rawRes = await fetch(rawUrl, { cache: "no-store" });

  if (rawRes.ok) {
    return rawRes.text();
  }

  // Private repo fallback: use GitHub API with auth header
  const apiUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
  const apiRes = await fetch(apiUrl, { headers: authHeaders(token) });

  if (!apiRes.ok) {
    throw new Error(`Failed to fetch file content: ${apiRes.status}`);
  }

  const data = await apiRes.json();
  // GitHub API returns base64-encoded content
  return Buffer.from(data.content, "base64").toString("utf-8");
}

// ─────────────────────────────────────────────────────────────
// Derive language from file extension (for syntax highlighting)
// ─────────────────────────────────────────────────────────────

const EXT_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  md: "markdown",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  sql: "sql",
  dockerfile: "dockerfile",
};

export function getLanguageFromPath(filePath: string): string {
  const filename = filePath.split("/").pop() ?? "";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  // Handle special filenames (e.g. Dockerfile)
  if (filename.toLowerCase() === "dockerfile") return "dockerfile";

  return EXT_MAP[ext] ?? "text";
}
