"use client";

import { useState, useRef, useEffect } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Bot,
  User,
  Loader2,
  GitFork,
  Zap,
  AlertCircle,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export default function AIChatPage() {
  const [repoInput, setRepoInput] = useState("");
  const [repoLocked, setRepoLocked] = useState(false);
  const [parsedRepo, setParsedRepo] = useState<{ owner: string; repo: string; branch: string } | null>(null);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function parseRepo(input: string) {
    const trimmed = input.trim().replace(/\.git$/, "").replace(/\/$/, "");
    const slash = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (slash) return { owner: slash[1], repo: slash[2] };
    const url = trimmed.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
    if (url) return { owner: url[1], repo: url[2] };
    return null;
  }

  async function handleLockRepo() {
    const parsed = parseRepo(repoInput);
    if (!parsed) {
      setError("Enter a valid repo: owner/repo or GitHub URL");
      return;
    }
    setError(null);
    setParsedRepo({ ...parsed, branch: "main" });
    setRepoLocked(true);

    // Auto-index
    setIsIndexing(true);
    setIndexStatus("Indexing repository...");
    try {
      const res = await fetch("/api/ai/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: parsed.owner, repo: parsed.repo }),
      });
      const data = await res.json();
      if (data.error) {
        setIndexStatus(`⚠️ ${data.error}`);
      } else {
        setIndexStatus(
          data.message === "Already indexed"
            ? "✓ Repository ready"
            : `✓ Indexed ${data.filesProcessed ?? 0} files (${data.chunksCreated ?? 0} chunks)`
        );
      }
    } catch {
      setIndexStatus("⚠️ Indexing failed — chat may not have context");
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleSend() {
    if (!query.trim() || isStreaming || !parsedRepo) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setQuery("");
    setIsStreaming(true);

    try {
      const history = messages
        .filter((m) => !m.isStreaming)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMsg.content,
          owner: parsedRepo.owner,
          repo: parsedRepo.repo,
          branch: parsedRepo.branch,
          history,
        }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "⚠️ Failed to get response. Is Ollama running?" }
            : m
        )
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        )
      );
      setIsStreaming(false);
    }
  }

  return (
    <DashboardShell>
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="mb-6 shrink-0">
          <h1 className="text-2xl font-bold text-slate-900">AI Chat</h1>
          <p className="text-sm text-slate-500 mt-1">
            Chat with any GitHub repository using RAG-powered AI
          </p>
        </div>

        {/* ── Repo Selector ──────────────────────────────── */}
        {!repoLocked ? (
          <div className="glass-card-static p-6 mb-6 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <GitFork size={15} className="text-violet-600" />
              <span className="text-sm font-medium text-slate-700">
                Select a repository to chat with
              </span>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => { setRepoInput(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleLockRepo()}
                placeholder="facebook/react or https://github.com/..."
                className="flex-1 px-4 py-2.5 text-sm bg-white/60 border border-[var(--border-glass)] rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition-all"
              />
              <button
                onClick={handleLockRepo}
                disabled={!repoInput.trim()}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                <Zap size={14} /> Connect
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <div className="glass-card-static px-4 py-2 flex items-center gap-2">
              <GitFork size={13} className="text-violet-600" />
              <span className="text-sm font-medium text-slate-700">
                {parsedRepo?.owner}/{parsedRepo?.repo}
              </span>
            </div>
            {indexStatus && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {isIndexing ? (
                  <Loader2 size={12} className="animate-spin text-violet-500" />
                ) : indexStatus.startsWith("✓") ? (
                  <Zap size={12} className="text-emerald-500" />
                ) : (
                  <AlertCircle size={12} className="text-amber-500" />
                )}
                {indexStatus}
              </div>
            )}
            <button
              onClick={() => { setRepoLocked(false); setParsedRepo(null); setMessages([]); setIndexStatus(null); }}
              className="btn-ghost text-xs ml-auto"
            >
              Change repo
            </button>
          </div>
        )}

        {/* ── Messages ───────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0"
        >
          {messages.length === 0 && repoLocked && !isIndexing && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-4">
                <Bot size={28} className="text-violet-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-1">
                Start a conversation
              </h3>
              <p className="text-sm text-slate-400 max-w-sm">
                Ask anything about the codebase — architecture, specific files, bugs, or implementation details.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Bot size={14} className="text-white" />
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/10"
                    : "glass-card-static"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose-ai">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    {msg.isStreaming && (
                      <div className="typing-dots mt-2">
                        <span /><span /><span />
                      </div>
                    )}
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>

              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={14} className="text-slate-600" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Input ──────────────────────────────────────── */}
        {repoLocked && (
          <div className="glass-card-static p-3 shrink-0 mt-2">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask about the codebase..."
                disabled={isStreaming}
                className="flex-1 px-4 py-2.5 text-sm bg-transparent border-none text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !query.trim()}
                className="w-9 h-9 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-sm hover:shadow-md transition-all disabled:opacity-40"
              >
                {isStreaming ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
