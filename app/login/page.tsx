import { signIn } from "@/auth";
import { Cpu, Sparkles } from "lucide-react";

function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center mesh-gradient">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="glass-card-static p-8 flex flex-col items-center gap-6 shadow-elevated">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
              <Cpu size={18} className="text-white" />
            </div>
            <span className="text-slate-900 font-bold text-xl tracking-tight">
              Dev
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-500">
                OS
              </span>
            </span>
          </div>

          {/* Headline */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 leading-snug">
              Welcome back
            </h1>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Sign in with GitHub to start exploring your codebases with AI.
            </p>
          </div>

          {/* GitHub OAuth */}
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/dashboard" });
            }}
            className="w-full"
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-medium text-sm py-3 px-4 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg cursor-pointer"
            >
              <GitHubIcon size={18} />
              Continue with GitHub
            </button>
          </form>

          {/* Footer */}
          <p className="text-xs text-slate-400 text-center leading-relaxed">
            By signing in, you grant DevOS read access to your repositories.
            Your code is{" "}
            <span className="text-violet-600 font-medium">never</span> sent to
            third-party AI services.
          </p>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1.5">
          <Sparkles size={10} className="text-violet-400" />
          DevOS v1.0 — AI Repo Intelligence Platform
        </p>
      </div>
    </main>
  );
}
