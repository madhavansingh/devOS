/** A single item in the GitHub recursive tree response */
export interface GitTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

/** GitHub tree API response */
export interface GitTree {
  sha: string;
  url: string;
  tree: GitTreeItem[];
  truncated: boolean;
}

/** Hydrated file node used by the File Explorer UI */
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
}

/** Repo metadata used across the workspace */
export interface RepoMeta {
  owner: string;
  name: string;
  defaultBranch: string;
  description: string | null;
  stars: number;
  language: string | null;
}
