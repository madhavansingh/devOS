import { LucideIcon } from "lucide-react";
import Link from "next/link";

interface FeatureCardProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  tag: string;
  href: string;
}

export default function FeatureCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  tag,
  href,
}: FeatureCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 glass-card p-6 text-left cursor-pointer"
    >
      {/* Icon */}
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg} transition-transform duration-300 group-hover:scale-110`}
      >
        <Icon size={20} className={iconColor} />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5 flex-1">
        <h3 className="text-slate-900 font-semibold text-[15px] group-hover:text-violet-700 transition-colors duration-200">
          {title}
        </h3>
        <p className="text-slate-500 text-[13px] leading-relaxed">{description}</p>
      </div>

      {/* Tag */}
      <span className="inline-flex items-center gap-1 uppercase text-[10px] tracking-[0.1em] font-semibold text-violet-600/60 bg-violet-50/60 px-2.5 py-1 rounded-full w-fit">
        {tag}
      </span>
    </Link>
  );
}
