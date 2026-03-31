"use client";

import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { FileNode } from "@/types/github";
import { useWorkspaceStore } from "@/lib/store";

interface TreeNodeProps {
  node: FileNode;
  owner: string;
  repo: string;
  branch: string;
  depth?: number;
}

export default function TreeNode({
  node,
  owner,
  repo,
  branch,
  depth = 0,
}: TreeNodeProps) {
  const {
    selectedFile,
    expandedFolders,
    toggleFolder,
    selectFile,
    setFileLoading,
  } = useWorkspaceStore();

  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFile?.path === node.path;
  const paddingLeft = 12 + depth * 14;

  const handleFileClick = async () => {
    if (node.type === "folder") {
      toggleFolder(node.path);
      return;
    }

    setFileLoading(true);
    try {
      const res = await fetch(
        `/api/github/blob?owner=${owner}&repo=${repo}&branch=${branch}&path=${encodeURIComponent(node.path)}`
      );
      const data = await res.json();
      if (data.content !== undefined) {
        selectFile(node, data.content, data.language);
      }
    } catch {
      // silent fail — viewer will retain previous content
    } finally {
      setFileLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleFileClick}
        style={{ paddingLeft }}
        className={`w-full flex items-center gap-1.5 py-[5px] pr-3 text-left text-[13px] rounded-lg transition-all duration-150 group cursor-pointer ${
          isSelected
            ? "bg-gradient-to-r from-violet-500/10 to-indigo-500/10 text-violet-800 font-medium border border-violet-200/30"
            : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
        }`}
      >
        {node.type === "folder" ? (
          <ChevronRight
            size={13}
            className={`shrink-0 text-slate-400 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-[13px] shrink-0" />
        )}

        {node.type === "folder" ? (
          isExpanded ? (
            <FolderOpen size={14} className="text-violet-500 shrink-0" />
          ) : (
            <Folder size={14} className="text-slate-400 group-hover:text-slate-600 shrink-0 transition-colors" />
          )
        ) : (
          <File size={13} className={`shrink-0 transition-colors ${isSelected ? "text-violet-500" : "text-slate-400 group-hover:text-slate-500"}`} />
        )}

        <span className="truncate">{node.name}</span>
      </button>

      {node.type === "folder" && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              owner={owner}
              repo={repo}
              branch={branch}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
