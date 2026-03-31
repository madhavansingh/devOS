"use client";

import { useWorkspaceStore } from "@/lib/store";
import ExplainPanel from "./ExplainPanel";
import ChatPanel from "./ChatPanel";
import { Sparkles, MessageSquare } from "lucide-react";

interface AISidebarProps {
  owner: string;
  repo: string;
}

export default function AISidebar({ owner, repo }: AISidebarProps) {
  const { activeTab, setActiveTab, selectedFile, isIndexed } =
    useWorkspaceStore();

  const tabs = [
    {
      id: "explain" as const,
      label: "Explain",
      icon: Sparkles,
      badge: !!selectedFile,
    },
    {
      id: "chat" as const,
      label: "Chat",
      icon: MessageSquare,
      badge: isIndexed,
    },
  ];

  return (
    <aside className="w-[336px] shrink-0 border-l border-[var(--border-glass)] glass-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-0 border-b border-[var(--border-glass)] shrink-0">
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-sm">
            <span className="text-white text-[10px] font-bold leading-none">
              AI
            </span>
          </div>
          <span className="text-sm font-semibold text-slate-800">
            Assistant
          </span>

          <span className="ml-auto text-[10px] font-medium text-slate-400 bg-white/60 border border-[var(--border-glass)] px-2 py-0.5 rounded-full">
            qwen2.5-coder
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              id={`ai-tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all duration-200 cursor-pointer ${
                activeTab === id
                  ? "border-violet-600 text-violet-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={12} />
              {label}
              {badge && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeTab === id ? "bg-violet-400" : "bg-emerald-400"
                  }`}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {activeTab === "explain" ? (
          <ExplainPanel />
        ) : (
          <ChatPanel owner={owner} repo={repo} />
        )}
      </div>
    </aside>
  );
}
