"use client";

import { useWorkspaceStore } from "@/lib/store";
import { useRef, useEffect, useState, FormEvent } from "react";
import { Send, Loader2, Database, Trash2 } from "lucide-react";
import ChatMessage from "./ChatMessage";

interface ChatPanelProps {
  owner: string;
  repo: string;
}

export default function ChatPanel({ owner, repo }: ChatPanelProps) {
  const {
    meta,
    chatMessages,
    isChatStreaming,
    isIndexed,
    isIndexing,
    indexingStatus,
    appendChatMessage,
    appendToChatStream,
    finalizeChatStream,
    clearChat,
    setIsIndexed,
    setIndexing,
  } = useWorkspaceStore();

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Indexing ─────────────────────────────────────────────
  const handleIndex = async () => {
    setIndexing(true, "Fetching repository files…");
    try {
      const res = await fetch("/api/ai/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsIndexed(true);
      setIndexing(
        false,
        `✓ Indexed ${data.chunksCreated} chunks from ${data.filesProcessed} files`
      );
    } catch (err) {
      setIndexing(
        false,
        `⚠️ ${err instanceof Error ? err.message : "Indexing failed"}`
      );
    }
  };

  // ── Send message ─────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || isChatStreaming || !isIndexed) return;

    setInput("");
    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: query,
    };
    appendChatMessage(userMsg);

    const assistantId = crypto.randomUUID();
    appendChatMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    });

    try {
      const history = chatMessages
        .filter((m) => !m.isStreaming)
        .slice(-6)
        .map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          owner,
          repo,
          branch: meta?.defaultBranch ?? "main",
          history,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Chat request failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToChatStream(
          assistantId,
          decoder.decode(value, { stream: true })
        );
      }
    } catch (err) {
      appendToChatStream(
        assistantId,
        `\n\n⚠️ ${err instanceof Error ? err.message : "Something went wrong"}`
      );
    } finally {
      finalizeChatStream(assistantId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Index banner */}
      {!isIndexed && (
        <div className="mx-3 mt-3 p-4 glass-card-static shrink-0 border-violet-200/50">
          <p className="text-xs text-slate-700 font-semibold mb-1.5">
            Repository not indexed yet
          </p>
          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            Index this repo to enable semantic chat. This may take 1–3 minutes
            depending on size.
          </p>
          <button
            onClick={handleIndex}
            disabled={isIndexing}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-300 text-white text-xs font-semibold py-2.5 rounded-xl transition-all duration-200 shadow-sm cursor-pointer"
          >
            {isIndexing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Indexing…
              </>
            ) : (
              <>
                <Database size={12} />
                Index Repository
              </>
            )}
          </button>
          {indexingStatus && (
            <p className="text-[11px] text-slate-500 mt-2 text-center">
              {indexingStatus}
            </p>
          )}

          {/* Progress bar during indexing */}
          {isIndexing && (
            <div className="progress-bar mt-2">
              <div
                className="progress-bar-fill"
                style={{ width: "60%", transition: "width 2s ease" }}
              />
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {isIndexed && chatMessages.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 px-5 text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
            <span className="text-violet-600 text-lg">✦</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Ask anything about this repo
            </p>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              &quot;How is authentication handled?&quot;
              <br />
              &quot;Where is the database initialized?&quot;
              <br />
              &quot;What does the payment flow look like?&quot;
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      {chatMessages.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-4">
          {chatMessages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-[var(--border-glass)] glass-surface shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isIndexed || isChatStreaming}
            placeholder={
              isIndexed
                ? "Ask about this codebase… (Enter to send)"
                : "Index the repo first to start chatting"
            }
            rows={2}
            className="flex-1 resize-none text-sm bg-white/60 backdrop-blur-sm border border-[var(--border-glass)] rounded-xl px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-transparent transition-all disabled:opacity-50"
          />
          <div className="flex flex-col gap-1.5">
            <button
              type="submit"
              disabled={!input.trim() || !isIndexed || isChatStreaming}
              className="w-9 h-9 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-slate-200 disabled:to-slate-200 text-white flex items-center justify-center transition-all shrink-0 shadow-sm cursor-pointer"
            >
              {isChatStreaming ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
            </button>
            {chatMessages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="w-9 h-9 rounded-xl bg-white/60 hover:bg-red-50 border border-[var(--border-glass)] hover:border-red-200 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                title="Clear chat"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
