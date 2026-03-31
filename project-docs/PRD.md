# Product Requirements Document (PRD)
**Product Name:** DevOS
**Tagline:** AI Repo Intelligence Platform
**Version:** 1.0 (MVP)

---

## 1. Problem
Modern codebases are massive, complex, and constantly evolving. When developers join a new project, explore an open-source repository, or try to debug an unfamiliar microservice, they spend hours—sometimes days—just building mental models of the project's architecture, locating the right files, and understanding how components interact.

The lack of instant, repository-level context means:
- **High Friction Onboarding:** New hires take weeks to become productive.
- **Slow Debugging:** Finding the root cause of an issue across undocumented or spaghetti code is tedious and error-prone.
- **Context Switching:** Developers frequently leave their workflow to search documentation (which is often outdated) or interrupt senior engineers for explanations.

There isn't a unified platform that acts as a "live brain" for a repository—one that can semantically understand the code, explain architectural decisions on the fly, and answer highly specific, contextual queries instantly.

---

## 2. Target Users
1. **Software Engineers & Developers:** Individual contributors who need to onboard quickly, debug faster, or explore unfamiliar open-source code efficiently without reading every line.
2. **Engineering Managers / Tech Leads:** Leaders who want to review system architecture, understand large pull requests, or audit codebase health without diving deep into the code editor.
3. **Open-Source Maintainers & Contributors:** Maintainers who want to make their repositories instantly explorable for new contributors, lowering the barrier to entry.
4. **Developer Relations (DevRel):** Professionals who need interactive ways to showcase their platform's example repos and APIs to the community.

---

## 3. Core Features (MVP)
The MVP focuses on solving the core problem of repository exploration and comprehension through AI:
*   **GitHub OAuth Login:** Secure authentication using GitHub, allowing users to safely connect their accounts and grant read access to their repositories.
*   **Fetch Repository Files:** Direct integration with the GitHub API to securely fetch repository metadata, directory structures, and file contents in real-time.
*   **File Tree Viewer:** An intuitive, IDE-style sidebar that renders the repository's folder and file hierarchy, supporting nested directories, expanding/collapsing, and seamless navigation.
*   **AI File Explanation:** A contextual action that allows a user to select any file and instantly generate a natural-language summary of its purpose, core logic, and dependencies.
*   **Chat with Repository:** A powerful, RAG-backed (Retrieval-Augmented Generation) conversational interface where users can ask broad or specific questions about the entire repository (e.g., "Where is authentication handled?", "How does the payment webhook work?").

---

## 4. User Flow (Step-by-step)

1. **Authentication:**
   * User navigates to the DevOS landing page.
   * Clicks "Login with GitHub".
   * Authorizes DevOS to read public (and optionally private) repositories.
2. **Repository Selection:**
   * After login, the user lands on a dashboard displaying their recent/owned repositories.
   * User can click a repository from the list or paste a valid GitHub repository URL into a search bar.
3. **Initialization & Indexing:**
   * User selects a repository (e.g., `facebook/react`).
   * **System Action:** DevOS fetches the repository tree. Concurrently, a backend worker begins chunking and indexing the codebase text into a vector database to enable semantic search.
   * A loading indicator shows indexing progress until the repo is fully ready for Chat.
4. **Codebase Exploration:**
   * User is presented with the main workspace.
   * **Left Panel:** The interactive File Tree Viewer.
   * **Center Panel:** The Code Viewer (displays raw code with syntax highlighting when a file is clicked).
   * **Right Panel:** The AI Assistant Sidebar (tabs for 'File Explain' and 'Chat').
5. **On-Demand Explanation:**
   * User clicks a complex file, e.g., `auth.ts`, from the File Tree.
   * The code appears in the center panel. User clicks the "Explain" button in the right panel.
   * DevOS streams a tailored explanation of `auth.ts`, highlighting its exports, main functions, and role in the app.
6. **Repository Chat (Deep Dive):**
   * User switches to the "Chat" tab in the right panel.
   * User types: *"How are JWT tokens validated?"*
   * **System Action:** DevOS queries the vector database, retrieves the relevant code snippets, synthesizes an answer, and streams it back to the user, citing the exact files (e.g., *See `lib/jwt.ts` and `middleware.ts`*).

---

## 5. Functional Requirements
*   **Authentication & Authorization:** 
    * Must implement NextAuth.js or Supabase Auth for GitHub OAuth.
    * Must store and manage session tokens securely.
*   **Data Fetching:** 
    * Must interact with the GitHub REST or GraphQL API to fetch the repository tree and file blobs.
    * Must gracefully handle GitHub API rate limits.
*   **UI/UX (Workspace):**
    * File Tree must support deeply nested structures and lazy loading if necessary.
    * Code Viewer must support syntax highlighting for all major programming languages.
*   **AI & RAG Pipeline:**
    * **File Explanation:** Must prompt an LLM (e.g., OpenAI/Anthropic) with the raw file content and stream the markdown response.
    * **Repo Chat:** Must chunk codebase text, generate embeddings, store them in a vector DB (e.g., Pinecone/Supabase pgvector), and perform semantic similarity searches based on user queries.
    * AI responses must include citations to specific files/lines.

---

## 6. Non-Functional Requirements
*   **Performance:** 
    * The initial repository file tree must render in under 2 seconds.
    * AI responses must begin streaming within 1.5 seconds to ensure perceived speed.
*   **Scalability:**
    * The indexing service must handle MVP repository sizes up to 50MB of text without crashing. Background jobs must handle high loads via message queues (e.g., Redis/Upstash).
*   **Security & Privacy:**
    * Private GitHub Access Tokens must be encrypted at rest.
    * Code snippets sent to external LLMs must use APIs that guarantee zero data retention for training (e.g., OpenAI API strict privacy policies).
*   **Reliability:**
    * 99.9% uptime target.
    * Graceful degradation: If the indexing fails, the standard file tree and basic code viewer must remain functional.

---

## 7. Future Roadmap (Phases)

### Phase 1: MVP (Current)
*   GitHub OAuth integration.
*   Repository fetching and Interactive File Tree Viewer.
*   Single-file explanation.
*   Repository-wide Semantic Chat (RAG).

### Phase 2: Enhanced Context & Workflows (Next 3-6 Months)
*   **Contextual Semantic Search:** A command palette (Cmd+K) to search for code by its *meaning*, not just plain text.
*   **Multi-Repo Context:** Allow the AI to answer architectural questions that span both a frontend and a backend repository simultaneously.
*   **PR & Commit Summaries:** Automatically generate release notes, commit messages, or human-readable descriptions of Pull Requests.
*   **Code Diagram Generation:** Automatically generate Mermaid/architecture diagrams based on repository folder structures and dependencies.

### Phase 3: Developer Action Layer (6-12 Months)
*   **Agentic Code Editing:** The AI can suggest architectural changes, refactors, or bug fixes, and automatically open a Pull Request directly on GitHub on the user's behalf.
*   **IDE Extensions:** Native integration via VS Code and JetBrains plugins, bringing DevOS intelligence directly into the local editor.
*   **Vulnerability & Anti-Pattern Auto-Fixes:** Proactive background scanning for security flaws or anti-patterns, proposing one-click remediation PRs.
