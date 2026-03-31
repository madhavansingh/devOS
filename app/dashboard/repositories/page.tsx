"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import {
  GitFork,
  ArrowRight,
  Loader2,
  Search,
  Globe,
  Lock,
  Star,
} from "lucide-react";

/* ── Suggested popular repos ────────────────────────────── */
const suggestions = [
  { owner: "facebook", name: "react", desc: "A declarative UI library", lang: "JavaScript", stars: "230k", isPublic: true },
  { owner: "vercel", name: "next.js", desc: "The React Framework", lang: "TypeScript", stars: "128k", isPublic: true },
  { owner: "supabase", name: "supabase", desc: "Open source Firebase alternative", lang: "TypeScript", stars: "75k", isPublic: true },
  { owner: "denoland", name: "deno", desc: "A modern JavaScript runtime", lang: "Rust", stars: "98k", isPublic: true },
  { owner: "tailwindlabs", name: "tailwindcss", desc: "Utility-first CSS framework", lang: "TypeScript", stars: "84k", isPublic: true },
  { owner: "ollama", name: "ollama", desc: "Get up and running with LLMs", lang: "Go", stars: "105k", isPublic: true },
];

const langColors: Record<string, string> = {
  JavaScript: "bg-amber-400",
  TypeScript: "bg-blue-500",
  Python: "bg-emerald-500",
  Rust: "bg-orange-500",
  Go: "bg-cyan-500",
};

export default function RepositoriesPage() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function parseRepo(input: string) {
    const trimmed = input.trim().replace(/\.git$/, "").replace(/\/$/, "");
    const slash = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (slash) return { owner: slash[1], name: slash[2] };
    const url = trimmed.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
    if (url) return { owner: url[1], name: url[2] };
    return null;
  }

  function handleExplore() {
    setError(null);
    const parsed = parseRepo(repoInput);
    if (!parsed) {
      setError("Enter a valid repo: owner/repo or GitHub URL");
      return;
    }
    setLoading(true);
    router.push(`/repo/${parsed.owner}/${parsed.name}`);
  }

  const filtered = suggestions.filter(
    (s) =>
      !searchQuery ||
      `${s.owner}/${s.name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Repositories</h1>
          <p className="text-sm text-slate-500 mt-1">
            Open any GitHub repository to explore, index, and chat with the AI.
          </p>
        </div>

        {/* ── Repo Input Card ─────────────────────────────── */}
        <div className="glass-card-static p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center">
              <GitFork size={18} className="text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Open a Repository
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Works with public and private repos (requires GitHub access)
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => {
                setRepoInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleExplore()}
              placeholder="facebook/react or https://github.com/vercel/next.js"
              className="flex-1 px-4 py-3 text-sm bg-white/60 backdrop-blur-sm border border-[var(--border-glass)] rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 transition-all duration-200"
            />
            <button
              onClick={handleExplore}
              disabled={loading || !repoInput.trim()}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ArrowRight size={15} />
              )}
              Explore
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-2 pl-1">{error}</p>}
        </div>

        {/* ── Suggested Repos ─────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.1em]">
              Popular Repositories
            </h2>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter…"
                className="pl-7 pr-3 py-1.5 text-xs bg-white/60 border border-[var(--border-glass)] rounded-lg text-slate-600 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20 w-40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((repo) => (
              <button
                key={`${repo.owner}/${repo.name}`}
                onClick={() => {
                  setLoading(true);
                  router.push(`/repo/${repo.owner}/${repo.name}`);
                }}
                className="group glass-card p-5 text-left"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center border border-slate-100">
                      <GitFork size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-slate-800 group-hover:text-violet-700 transition-colors">
                        {repo.owner}/{repo.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {repo.isPublic ? (
                          <Globe size={10} className="text-slate-400" />
                        ) : (
                          <Lock size={10} className="text-slate-400" />
                        )}
                        <span className="text-[10px] text-slate-400">
                          {repo.isPublic ? "Public" : "Private"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Star size={11} />
                    {repo.stars}
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                  {repo.desc}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${langColors[repo.lang] ?? "bg-slate-400"}`} />
                  <span className="text-[11px] text-slate-400 font-medium">
                    {repo.lang}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
