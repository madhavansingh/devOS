"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitFork,
  MessageSquareCode,
  Settings,
  Cpu,
  Sparkles,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Repositories", href: "/dashboard/repositories", icon: GitFork },
  { label: "AI Chat", href: "/dashboard/ai-chat", icon: MessageSquareCode },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-[260px] min-h-screen glass-surface px-4 py-6 shrink-0">
      {/* Logo */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 mb-10 px-2 group"
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20 transition-transform duration-300 group-hover:scale-105">
          <Cpu size={16} className="text-white" />
        </div>
        <span className="text-slate-900 font-bold text-lg tracking-tight">
          Dev<span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-500">OS</span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.1em] px-3 mb-2">
          Navigation
        </p>
        {navItems.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                active
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/15"
                  : "text-slate-500 hover:bg-white/60 hover:text-slate-800 hover:shadow-sm"
              }`}
            >
              <Icon
                size={17}
                className={`transition-transform duration-200 ${
                  active ? "" : "group-hover:scale-110"
                }`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Pro badge */}
      <div className="glass-card-static p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
          <Sparkles size={14} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-800">DevOS v1.0</p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            AI-powered codebase intelligence
          </p>
        </div>
      </div>
    </aside>
  );
}
