"use client";

import { FolderSearch, Bot, ShieldCheck } from "lucide-react";
import FeatureCard from "./FeatureCard";

const features = [
  {
    icon: FolderSearch,
    iconBg: "bg-violet-100/80",
    iconColor: "text-violet-600",
    title: "Explore Repos",
    description:
      "Browse the full file tree of any GitHub repository with instant syntax-highlighted code viewing.",
    tag: "Explorer",
    href: "/dashboard/repositories",
  },
  {
    icon: Bot,
    iconBg: "bg-indigo-100/80",
    iconColor: "text-indigo-600",
    title: "AI Chat",
    description:
      "Ask questions in plain English. The RAG pipeline retrieves exact code snippets and explains them.",
    tag: "AI Powered",
    href: "/dashboard/ai-chat",
  },
  {
    icon: ShieldCheck,
    iconBg: "bg-emerald-100/80",
    iconColor: "text-emerald-600",
    title: "100% Private",
    description:
      "Powered by Ollama locally. Your code never leaves your infrastructure — zero third-party APIs.",
    tag: "Privacy First",
    href: "/dashboard/settings",
  },
];

export default function FeatureGrid() {
  return (
    <div>
      <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.1em] mb-4">
        Quick Actions
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </div>
  );
}
