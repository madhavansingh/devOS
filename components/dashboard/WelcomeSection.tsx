"use client";

import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";

export default function WelcomeSection() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? session?.user?.githubLogin ?? "Developer";

  return (
    <div className="mb-10">
      <div className="inline-flex items-center gap-2 bg-violet-100/60 backdrop-blur-sm text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4 border border-violet-200/50">
        <Sparkles size={12} />
        AI Repo Intelligence
      </div>
      <h1 className="text-3xl font-bold text-slate-900 leading-snug">
        Hi {firstName},{" "}
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-500">
          Ready to explore?
        </span>
      </h1>
      <p className="mt-2 text-slate-500 text-[15px] max-w-lg leading-relaxed">
        Select a repository or chat with the AI about your codebase — architecture, bugs, explanations, and more.
      </p>
    </div>
  );
}
