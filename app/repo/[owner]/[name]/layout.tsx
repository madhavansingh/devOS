import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Cpu, LayoutDashboard } from "lucide-react";
import Image from "next/image";

export default async function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; name: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { owner, name } = await params;
  const userName = session.user?.name ?? session.user?.githubLogin ?? "U";
  const userImage = session.user?.image;

  return (
    <div className="flex flex-col h-screen mesh-gradient overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center gap-4 px-4 py-2.5 glass-surface border-b border-[var(--border-glass)] shrink-0 z-10">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0 group">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 shadow-sm transition-transform duration-200 group-hover:scale-105">
            <Cpu size={13} className="text-white" />
          </div>
          <span className="text-slate-900 font-bold text-base tracking-tight">
            Dev<span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-500">OS</span>
          </span>
        </Link>

        <span className="text-slate-300">/</span>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-slate-500 truncate">{owner}</span>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-800 truncate">{name}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/dashboard"
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <LayoutDashboard size={13} />
            Dashboard
          </Link>

          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center overflow-hidden ring-2 ring-white shadow-sm">
            {userImage ? (
              <Image src={userImage} alt={userName} width={28} height={28} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold">
                {userName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* 3-Panel Body */}
      <div className="flex flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
