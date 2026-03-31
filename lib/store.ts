import { create } from "zustand";
import { FileNode, RepoMeta } from "@/types/github";
import { OllamaMessage } from "@/lib/ollama";

// ─────────────────────────────────────────────────────────────
// Chat message (UI layer, extends OllamaMessage)
// ─────────────────────────────────────────────────────────────
export interface ChatMessage extends OllamaMessage {
  id: string;
  isStreaming?: boolean;
}

interface WorkspaceState {
  // ── Repo ──────────────────────────────────────────────────
  meta: RepoMeta | null;
  tree: FileNode[];
  isLoadingTree: boolean;
  treeError: string | null;

  // ── Selected file ─────────────────────────────────────────
  selectedFile: FileNode | null;
  fileContent: string | null;
  fileLanguage: string | null;
  isLoadingFile: boolean;

  // ── File Explorer UI ──────────────────────────────────────
  expandedFolders: Set<string>;

  // ── AI Sidebar tab ────────────────────────────────────────
  activeTab: "explain" | "chat";
  setActiveTab: (tab: "explain" | "chat") => void;

  // ── File Explanation ──────────────────────────────────────
  explanation: string | null;
  isExplaining: boolean;
  setExplanation: (text: string | null) => void;
  appendExplanation: (chunk: string) => void;
  setExplaining: (v: boolean) => void;

  // ── Repo Chat ─────────────────────────────────────────────
  chatMessages: ChatMessage[];
  isChatStreaming: boolean;
  appendChatMessage: (msg: ChatMessage) => void;
  appendToChatStream: (id: string, chunk: string) => void;
  finalizeChatStream: (id: string) => void;
  clearChat: () => void;

  // ── Repo Indexing ─────────────────────────────────────────
  isIndexed: boolean;
  isIndexing: boolean;
  indexingStatus: string | null;
  setIsIndexed: (v: boolean) => void;
  setIndexing: (v: boolean, status?: string) => void;

  // ── File Actions ──────────────────────────────────────────
  setMeta: (meta: RepoMeta) => void;
  setTree: (tree: FileNode[]) => void;
  setTreeLoading: (loading: boolean) => void;
  setTreeError: (error: string | null) => void;
  selectFile: (file: FileNode, content: string, language: string) => void;
  setFileLoading: (loading: boolean) => void;
  toggleFolder: (path: string) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  // ── Repo ──────────────────────────────────────────────────
  meta: null,
  tree: [],
  isLoadingTree: false,
  treeError: null,

  // ── Selected file ─────────────────────────────────────────
  selectedFile: null,
  fileContent: null,
  fileLanguage: null,
  isLoadingFile: false,

  // ── File Explorer UI ──────────────────────────────────────
  expandedFolders: new Set<string>(),

  // ── AI Sidebar tab ────────────────────────────────────────
  activeTab: "explain",
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── File Explanation ──────────────────────────────────────
  explanation: null,
  isExplaining: false,
  setExplanation: (text) => set({ explanation: text }),
  appendExplanation: (chunk) =>
    set((state) => ({ explanation: (state.explanation ?? "") + chunk })),
  setExplaining: (v) => set({ isExplaining: v }),

  // ── Repo Chat ─────────────────────────────────────────────
  chatMessages: [],
  isChatStreaming: false,

  appendChatMessage: (msg) =>
    set((state) => ({ chatMessages: [...state.chatMessages, msg] })),

  appendToChatStream: (id, chunk) =>
    set((state) => ({
      isChatStreaming: true,
      chatMessages: state.chatMessages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk, isStreaming: true } : m
      ),
    })),

  finalizeChatStream: (id) =>
    set((state) => ({
      isChatStreaming: false,
      chatMessages: state.chatMessages.map((m) =>
        m.id === id ? { ...m, isStreaming: false } : m
      ),
    })),

  clearChat: () => set({ chatMessages: [], isChatStreaming: false }),

  // ── Repo Indexing ─────────────────────────────────────────
  isIndexed: false,
  isIndexing: false,
  indexingStatus: null,
  setIsIndexed: (v) => set({ isIndexed: v }),
  setIndexing: (v, status) =>
    set({ isIndexing: v, indexingStatus: status ?? null }),

  // ── Actions ───────────────────────────────────────────────
  setMeta: (meta) => set({ meta }),
  setTree: (tree) => set({ tree }),
  setTreeLoading: (loading) => set({ isLoadingTree: loading }),
  setTreeError: (error) => set({ treeError: error }),

  selectFile: (file, content, language) =>
    set({
      selectedFile: file,
      fileContent: content,
      fileLanguage: language,
      explanation: null, // clear stale explanation on new file
    }),

  setFileLoading: (loading) => set({ isLoadingFile: loading }),

  toggleFolder: (path) =>
    set((state) => {
      const next = new Set(state.expandedFolders);
      next.has(path) ? next.delete(path) : next.add(path);
      return { expandedFolders: next };
    }),

  reset: () =>
    set({
      meta: null,
      tree: [],
      isLoadingTree: false,
      treeError: null,
      selectedFile: null,
      fileContent: null,
      fileLanguage: null,
      isLoadingFile: false,
      expandedFolders: new Set<string>(),
      activeTab: "explain",
      explanation: null,
      isExplaining: false,
      chatMessages: [],
      isChatStreaming: false,
      isIndexed: false,
      isIndexing: false,
      indexingStatus: null,
    }),
}));
