"use client";

import { useEffect } from "react";
import { GitFork, AlertCircle, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "@/lib/store";
import TreeNode from "./TreeNode";

interface FileTreeProps {
  owner: string;
  repo: string;
}

/* ── Tree Skeleton ────────────────────────────────────────── */
function TreeSkeleton() {
  return (
    <div className="space-y-2 px-2 py-3">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 12}px` }}>
          <div className="skeleton w-4 h-4 rounded" />
          <div className="skeleton h-3 rounded" style={{ width: `${60 + Math.random() * 40}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function FileTree({ owner, repo }: FileTreeProps) {
  const { meta, tree, isLoadingTree, treeError, setTree, setMeta, setTreeLoading, setTreeError } =
    useWorkspaceStore();

  useEffect(() => {
    const load = async () => {
      setTreeLoading(true);
      setTreeError(null);
      try {
        const res = await fetch(`/api/github/tree?owner=${owner}&repo=${repo}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setMeta(data.meta);
        setTree(data.tree);
      } catch (err) {
        setTreeError(err instanceof Error ? err.message : "Failed to load repository");
      } finally {
        setTreeLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo]);

  return (
    <aside className="flex flex-col w-64 shrink-0 border-r border-[var(--border-glass)] glass-surface h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-glass)]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center shrink-0">
          <GitFork size={13} className="text-violet-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">
            {owner}/{repo}
          </p>
          {meta && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {meta.defaultBranch} · {meta.language ?? "Repo"}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoadingTree && <TreeSkeleton />}

        {treeError && (
          <div className="flex items-start gap-2 mx-2 mt-3 p-3 glass-card-static border-red-200/50">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{treeError}</p>
          </div>
        )}

        {!isLoadingTree && !treeError && tree.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-8">
            Repository is empty.
          </p>
        )}

        {!isLoadingTree &&
          !treeError &&
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              owner={owner}
              repo={repo}
              branch={meta?.defaultBranch ?? "main"}
            />
          ))}
      </div>
    </aside>
  );
}
