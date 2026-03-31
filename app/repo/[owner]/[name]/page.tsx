import FileTree from "@/components/explorer/FileTree";
import CodeViewer from "@/components/viewer/CodeViewer";
import AISidebar from "@/components/chat/AISidebar";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ owner: string; name: string }>;
}) {
  const { owner, name } = await params;

  return (
    <>
      {/* Left Panel — File Explorer */}
      <FileTree owner={owner} repo={name} />

      {/* Center Panel — Code Viewer */}
      <CodeViewer />

      {/* Right Panel — AI Sidebar (Phase 4: Explain + RAG Chat) */}
      <AISidebar owner={owner} repo={name} />
    </>
  );
}
