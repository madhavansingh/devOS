"use client";

import { ChatMessage as ChatMessageType } from "@/lib/store";
import { Bot, User, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from "react-syntax-highlighter";
import { githubGist } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { useState } from "react";

interface Props {
  message: ChatMessageType;
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const lang = match?.[1] ?? "text";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 rounded-xl overflow-hidden border border-[var(--border-glass)]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/60 backdrop-blur-sm border-b border-[var(--border-glass)]">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
          {lang}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check size={10} className="text-emerald-500" />
              <span className="text-emerald-500">Copied</span>
            </>
          ) : (
            <>
              <Copy size={10} />
              Copy
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={githubGist}
        customStyle={{
          margin: 0,
          padding: "10px 12px",
          background: "rgba(255,255,255,0.6)",
          fontSize: "12px",
          lineHeight: "1.6",
        }}
        codeTagProps={{
          style: { fontFamily: "'Geist Mono', 'Fira Code', monospace" },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export default function ChatMessage({ message }: Props) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={`flex gap-2.5 ${isAssistant ? "items-start" : "items-start flex-row-reverse"}`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 shadow-sm ${
          isAssistant
            ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
            : "bg-slate-800 text-white"
        }`}
      >
        {isAssistant ? <Bot size={13} /> : <User size={13} />}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isAssistant
            ? "glass-card-static text-slate-800"
            : "bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-tr-sm shadow-md"
        }`}
      >
        {isAssistant ? (
          <div className="prose prose-sm prose-slate max-w-none [&_pre]:hidden [&_code]:text-[12px] [&_code]:bg-violet-50/60 [&_code]:text-violet-700 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_a]:text-violet-600 [&_a]:no-underline [&_a:hover]:underline">
            <ReactMarkdown
              components={{
                code({ className, children, ...props }) {
                  const isBlock =
                    className?.startsWith("language-") ||
                    String(children).includes("\n");
                  if (isBlock) {
                    return (
                      <CodeBlock className={className}>{children}</CodeBlock>
                    );
                  }
                  return (
                    <code
                      className="text-[12px] bg-violet-50/60 text-violet-700 rounded px-1 py-0.5 font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                strong({ children }) {
                  const text = String(children);
                  if (text.includes("/") || text.includes(".ts")) {
                    return (
                      <code className="text-[12px] bg-violet-50 text-violet-700 border border-violet-100 rounded px-1 py-0.5 font-mono font-normal">
                        {children}
                      </code>
                    );
                  }
                  return <strong>{children}</strong>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message.isStreaming && (
              <div className="typing-dots mt-1">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
      </div>
    </div>
  );
}
