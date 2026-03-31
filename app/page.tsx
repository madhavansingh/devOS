import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  Cpu,
  ArrowRight,
  FolderSearch,
  Bot,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default async function HomePage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen mesh-gradient flex flex-col">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5 group">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20 transition-transform duration-300 group-hover:scale-105">
            <Cpu size={15} className="text-white" />
          </div>
          <span className="text-slate-900 font-bold text-lg tracking-tight">
            Dev
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-500">
              OS
            </span>
          </span>
        </div>

        <Link
          href="/login"
          className="btn-primary flex items-center gap-2 text-sm"
        >
          Get Started <ArrowRight size={14} />
        </Link>
      </nav>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="flex flex-col items-center justify-center text-center flex-1 px-6 py-20">
        <div className="inline-flex items-center gap-2 glass-card-static px-4 py-2 text-xs font-semibold text-violet-700 mb-6">
          <Sparkles size={12} />
          AI Repo Intelligence Platform
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 leading-[1.1] max-w-3xl">
          Understand any{" "}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-500">
            codebase
          </span>{" "}
          in seconds
        </h1>

        <p className="mt-5 text-slate-500 text-lg max-w-xl leading-relaxed">
          DevOS lets you explore GitHub repositories, explain files, and chat
          with your entire codebase using AI — all with zero data sent to
          third-party services.
        </p>

        <div className="flex items-center gap-3 mt-8">
          <Link
            href="/login"
            className="btn-primary flex items-center gap-2 text-sm px-6 py-3"
          >
            Connect GitHub <ArrowRight size={15} />
          </Link>
          <a
            href="#features"
            className="btn-ghost text-sm"
          >
            See features →
          </a>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section
        id="features"
        className="max-w-5xl mx-auto w-full px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-5"
      >
        {[
          {
            icon: FolderSearch,
            iconBg: "bg-violet-100/80",
            iconColor: "text-violet-600",
            title: "Explore Any Repo",
            desc: "IDE-style file tree with instant syntax-highlighted code viewing for any GitHub repository.",
          },
          {
            icon: Bot,
            iconBg: "bg-indigo-100/80",
            iconColor: "text-indigo-600",
            title: "Chat with Codebase",
            desc: "Ask broad or specific questions. The RAG pipeline retrieves exact code snippets and cites files.",
          },
          {
            icon: ShieldCheck,
            iconBg: "bg-emerald-100/80",
            iconColor: "text-emerald-600",
            title: "100% Private AI",
            desc: "Powered by Ollama locally. Your code never leaves your infrastructure.",
          },
        ].map(({ icon: Icon, iconBg, iconColor, title, desc }) => (
          <div key={title} className="glass-card p-6 flex flex-col gap-4">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}
            >
              <Icon size={19} className={iconColor} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-[15px]">
                {title}
              </h3>
              <p className="text-slate-500 text-[13px] mt-1 leading-relaxed">
                {desc}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="text-center py-6 text-xs text-slate-400 border-t border-[var(--border-glass)]">
        DevOS v1.0 — Built with Next.js, Supabase & Ollama
      </footer>
    </main>
  );
}
