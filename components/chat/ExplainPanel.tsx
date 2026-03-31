"use client";

import { useWorkspaceStore } from "@/lib/store";
import { Sparkles, Loader2, File, AlertCircle, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from "react-syntax-highlighter";
import { githubGist } from "react-syntax-highlighter/dist/esm/styles/hljs";

function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <code className="text-[12px] bg-violet-50/60 text-violet-700 rounded px-1 py-0.5 font-mono">
      {children}
    </code>
  );
}

function BlockCode({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const match = /language-(\w+)/.exec(className || "");
  const lang = match?.[1] ?? "text";
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-[var(--border-glass)]">
      <div className="px-3 py-1.5 bg-white/60 backdrop-blur-sm border-b border-[var(--border-glass)]">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
          {lang}
        </span>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={githubGist}
        customStyle={{
          margin: 0,
          padding: "10px 12px",
          background: "rgba(255,255,255,0.6)",
          fontSize: "12px",
          lineHeight: "1.6",
        }}
        codeTagProps={{
          style: { fontFamily: "'Geist Mono', 'Fira Code', monospace" },
        }}
      >
        {String(children).replace(/\n$/, "")}
      </SyntaxHighlighter>
    </div>
  );
}

/* ── Skeleton loader for explanation ─────────────────────── */
function ExplainSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-5/6" />
      <div className="skeleton h-20 w-full mt-2" />
      <div className="skeleton h-3 w-2/3" />
      <div className="skeleton h-3 w-4/5" />
    </div>
  );
}

export default function ExplainPanel() {
  const {
    selectedFile,
    fileContent,
    explanation,
    isExplaining,
    setExplanation,
    appendExplanation,
    setExplaining,
    setActiveTab,
  } = useWorkspaceStore();

  const handleExplain = async () => {
    if (!selectedFile || !fileContent) return;

    setExplanation(null);
    setExplaining(true);

    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: selectedFile.path,
          fileContent,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Explain request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      setExplanation("");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendExplanation(decoder.decode(value, { stream: true }));
      }
    } catch {
      setExplanation(
        "⚠️ Failed to connect to Ollama. Make sure it's running locally (`ollama serve`)."
      );
    } finally {
      setExplaining(false);
    }
  };

  // ── Empty state ────────────────────────────────────────
  if (!selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-5 text-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
          <File size={18} className="text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-600 mb-1">
            No file selected
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Click any file in the explorer, then hit{" "}
            <strong className="text-slate-600">Explain File</strong> to get an
            AI breakdown.
          </p>
        </div>
      </div>
    );
  }

  // ── File is open ───────────────────────────────────────
  const lineCount = (fileContent ?? "").split("\n").length;
  const charCount = (fileContent ?? "").length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* File context + action */}
      <div className="px-4 py-3 border-b border-[var(--border-glass)] glass-surface shrink-0 space-y-2.5">
        <div className="flex items-start gap-2">
          <File size={12} className="text-slate-300 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-500 font-mono break-all leading-snug">
            {selectedFile.path}
          </p>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[10px] bg-white/60 text-slate-500 px-2 py-0.5 rounded-full border border-[var(--border-glass)]">
            {lineCount.toLocaleString()} lines
          </span>
          <span className="text-[10px] bg-white/60 text-slate-500 px-2 py-0.5 rounded-full border border-[var(--border-glass)]">
            {charCount > 1000
              ? `${(charCount / 1000).toFixed(1)}k chars`
              : `${charCount} chars`}
          </span>
          {charCount > 30000 && (
            <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
              ✂ will be truncated
            </span>
          )}
        </div>

        <button
          id="explain-file-btn"
          onClick={handleExplain}
          disabled={isExplaining}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-300 text-white text-sm font-medium py-2.5 rounded-xl transition-all duration-200 shadow-sm cursor-pointer"
        >
          {isExplaining ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Generating…
            </>
          ) : explanation !== null ? (
            <>
              <RotateCcw size={13} />
              Re-explain
            </>
          ) : (
            <>
              <Sparkles size={13} />
              Explain File
            </>
          )}
        </button>
      </div>

      {/* Output area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Skeleton loader during first explain */}
        {isExplaining && explanation === null && <ExplainSkeleton />}

        {/* Prompt hint */}
        {explanation === null && !isExplaining && (
          <div className="flex items-start gap-2 p-3 glass-card-static">
            <AlertCircle
              size={13}
              className="text-violet-400 shrink-0 mt-0.5"
            />
            <p className="text-xs text-slate-600 leading-relaxed">
              Click <strong>Explain File</strong> to analyze this file with AI.
              Want to ask broader questions?{" "}
              <button
                onClick={() => setActiveTab("chat")}
                className="underline font-semibold text-violet-600 cursor-pointer"
              >
                Switch to Chat
              </button>
            </p>
          </div>
        )}

        {/* Explanation output */}
        {explanation !== null && (
          <div className="prose prose-sm prose-slate max-w-none [&_code]:text-[12px] [&_code]:bg-violet-50/60 [&_code]:text-violet-700 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_a]:text-violet-600">
            <ReactMarkdown
              components={{
                code({ className, children }) {
                  const isBlock =
                    className?.startsWith("language-") ||
                    String(children).includes("\n");
                  if (isBlock) {
                    return (
                      <BlockCode className={className}>{children}</BlockCode>
                    );
                  }
                  return <InlineCode>{children}</InlineCode>;
                },
              }}
            >
              {explanation}
            </ReactMarkdown>
            {isExplaining && (
              <div className="typing-dots mt-1">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
