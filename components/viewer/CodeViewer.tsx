"use client";

import { useWorkspaceStore } from "@/lib/store";
import { Loader2, File, Copy, Check, Sparkles } from "lucide-react";
import { useState } from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { githubGist } from "react-syntax-highlighter/dist/esm/styles/hljs";

/* ── Code Skeleton Loader ──────────────────────────────────── */
function CodeSkeleton() {
  return (
    <div className="p-6 space-y-2.5">
      {[...Array(15)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton w-8 h-3 rounded" />
          <div
            className="skeleton h-3 rounded"
            style={{ width: `${30 + Math.random() * 60}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export default function CodeViewer() {
  const {
    selectedFile,
    fileContent,
    fileLanguage,
    isLoadingFile,
    activeTab,
    setActiveTab,
    isExplaining,
  } = useWorkspaceStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!fileContent) return;
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExplainShortcut = () => {
    if (activeTab !== "explain") setActiveTab("explain");
    setTimeout(() => {
      const btn = document.getElementById("explain-file-btn");
      btn?.click();
    }, 80);
  };

  // Empty state
  if (!selectedFile && !isLoadingFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
          <File size={24} className="text-slate-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-500">No file selected</p>
          <p className="text-xs mt-1 text-slate-400">
            Click any file in the explorer to view its content
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoadingFile) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-glass)] glass-surface">
          <div className="skeleton w-4 h-4 rounded" />
          <div className="skeleton h-3 w-48 rounded" />
        </div>
        <CodeSkeleton />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* File header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-glass)] glass-surface shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <File size={13} className="text-slate-400 shrink-0" />
          <span className="text-xs text-slate-600 font-mono truncate">
            {selectedFile?.path}
          </span>
          {fileLanguage && (
            <span className="text-[10px] font-medium text-violet-600 bg-violet-50/60 backdrop-blur-sm border border-violet-100 px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0">
              {fileLanguage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="codev-explain-btn"
            onClick={handleExplainShortcut}
            disabled={isExplaining}
            title="Explain this file with AI"
            className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 hover:bg-violet-50 disabled:opacity-50 border border-violet-200 hover:border-violet-300 px-2.5 py-1 rounded-xl transition-all duration-200 cursor-pointer"
          >
            {isExplaining ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Sparkles size={11} />
            )}
            Explain
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1 rounded-xl hover:bg-white/60 cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-500" />
                <span className="text-emerald-500">Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code area */}
      <div className="flex-1 overflow-auto text-sm">
        <SyntaxHighlighter
          language={fileLanguage ?? "text"}
          style={githubGist}
          showLineNumbers
          lineNumberStyle={{
            color: "#cbd5e1",
            fontSize: "12px",
            paddingRight: "16px",
            minWidth: "40px",
            userSelect: "none",
          }}
          customStyle={{
            margin: 0,
            padding: "16px 0",
            background: "rgba(255,255,255,0.7)",
            fontSize: "13px",
            lineHeight: "1.6",
            height: "100%",
          }}
          codeTagProps={{
            style: { fontFamily: "'Geist Mono', 'Fira Code', monospace" },
          }}
        >
          {fileContent ?? ""}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
