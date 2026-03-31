"use client";

import { Search, Bell, LogOut } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";

export default function Header() {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? session?.user?.githubLogin ?? "Developer";
  const userImage = session?.user?.image;

  return (
    <header className="flex items-center justify-between h-16 px-6 glass-surface border-b border-[var(--border-glass)] shrink-0 z-10">
      {/* Search bar */}
      <div className="relative w-full max-w-md">
        <Search
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          placeholder="Search repositories, files, conversations…"
          className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white/60 backdrop-blur-sm border border-[var(--border-glass)] rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-300 transition-all duration-200"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-white/80 border border-slate-200 px-1.5 py-0.5 rounded-md font-mono">
          ⌘K
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2.5 ml-4">
        {/* Notification bell */}
        <button className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white/60 backdrop-blur-sm border border-[var(--border-glass)] text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm transition-all duration-200">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-violet-500 border-2 border-white" />
        </button>

        {/* User pill */}
        <div className="flex items-center gap-2.5 bg-white/60 backdrop-blur-sm border border-[var(--border-glass)] rounded-xl px-3 py-1.5 hover:bg-white hover:shadow-sm transition-all duration-200 cursor-pointer group">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center overflow-hidden ring-2 ring-white shadow-sm">
            {userImage ? (
              <Image
                src={userImage}
                alt={userName}
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-white text-xs font-bold">
                {userName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="text-[13px] font-medium text-slate-700 hidden sm:block max-w-[120px] truncate">
            {userName}
          </span>
        </div>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/60 backdrop-blur-sm border border-[var(--border-glass)] text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all duration-200"
          title="Sign out"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
