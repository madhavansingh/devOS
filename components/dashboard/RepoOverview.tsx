"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitFork, ArrowRight, Loader2 } from "lucide-react";

export default function RepoOverview() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseRepoUrl(input: string): { owner: string; name: string } | null {
    const trimmed = input.trim().replace(/\.git$/, "").replace(/\/$/, "");

    // Handle `owner/repo` format
    const slashMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (slashMatch) return { owner: slashMatch[1], name: slashMatch[2] };

    // Handle full GitHub URL
    const urlMatch = trimmed.match(
      /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/
    );
    if (urlMatch) return { owner: urlMatch[1], name: urlMatch[2] };

    return null;
  }

  function handleExplore() {
    setError(null);
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      setError("Enter a valid GitHub repo (e.g. facebook/react or full URL)");
      return;
    }
    setLoading(true);
    router.push(`/repo/${parsed.owner}/${parsed.name}`);
  }

  return (
    <div>
      <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.1em] mb-4">
        Explore a Repository
      </h2>

      <div className="glass-card-static p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center">
            <GitFork size={18} className="text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Open a GitHub Repository</h3>
            <p className="text-xs text-slate-400 mt-0.5">Enter a repo URL or owner/name to start exploring</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleExplore()}
              placeholder="facebook/react or https://github.com/vercel/next.js"
              className="w-full px-4 py-3 text-sm bg-white/60 backdrop-blur-sm border border-[var(--border-glass)] rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 transition-all duration-200"
            />
          </div>
          <button
            onClick={handleExplore}
            disabled={loading || !repoUrl.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none whitespace-nowrap"
          >
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ArrowRight size={15} />
            )}
            Explore
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-2 pl-1">{error}</p>
        )}
      </div>
    </div>
  );
}
