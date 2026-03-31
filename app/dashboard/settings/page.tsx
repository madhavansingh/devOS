"use client";

import { useSession, signOut } from "next-auth/react";
import DashboardShell from "@/components/layout/DashboardShell";
import Image from "next/image";
import {
  User,
  Shield,
  Cpu,
  LogOut,
  ExternalLink,
} from "lucide-react";

function GitHubIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <DashboardShell>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your profile and preferences
          </p>
        </div>

        {/* ── Profile Card ───────────────────────────────── */}
        <div className="glass-card-static p-6 mb-6">
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.1em] mb-5">
            <User size={12} className="inline mr-1.5 -mt-0.5" />
            Profile
          </h2>
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center overflow-hidden ring-4 ring-white shadow-lg">
              {user?.image ? (
                <Image
                  src={user.image}
                  alt={user.name ?? ""}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white text-xl font-bold">
                  {(user?.name ?? "U").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                {user?.name ?? "Developer"}
              </h3>
              <p className="text-sm text-slate-500">{user?.email ?? "—"}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <GitHubIcon size={12} />
                <span className="text-xs text-slate-400">Connected via GitHub</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Security Info ───────────────────────────────── */}
        <div className="glass-card-static p-6 mb-6">
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.1em] mb-5">
            <Shield size={12} className="inline mr-1.5 -mt-0.5" />
            Privacy & Security
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100/80 flex items-center justify-center shrink-0 mt-0.5">
                <Shield size={14} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">100% Local AI Processing</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  All AI operations run via Ollama on your infrastructure. Your code is never sent to external servers.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100/80 flex items-center justify-center shrink-0 mt-0.5">
                <Cpu size={14} className="text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">RAG-Powered Intelligence</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Repository code is chunked and embedded via pgvector in your Supabase instance for precise retrieval.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── AI Config ──────────────────────────────────── */}
        <div className="glass-card-static p-6 mb-6">
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.1em] mb-5">
            <Cpu size={12} className="inline mr-1.5 -mt-0.5" />
            AI Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Chat Model", value: process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? "llama3.2" },
              { label: "Embedding Model", value: "nomic-embed-text" },
              { label: "Vector Dimensions", value: "768" },
              { label: "Top-K Retrieval", value: "6 chunks" },
            ].map((item) => (
              <div key={item.label} className="bg-white/40 rounded-xl px-4 py-3 border border-[var(--border-glass)]">
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{item.label}</p>
                <p className="text-sm font-semibold text-slate-700 mt-1">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/settings/applications"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <ExternalLink size={13} />
            Manage GitHub Access
          </a>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="btn-ghost flex items-center gap-2 text-sm text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={13} />
            Sign Out
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
