# 🧠 DevOS: AI Repo Intelligence Platform

> **The "live brain" for your codebase.** DevOS is an intelligent platform that allows you to semantically search, explore, and converse with your entire repository using local, privacy-first AI.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-pgvector-green)](https://supabase.com/)
[![Ollama](https://img.shields.io/badge/Ollama-qwen-white)](https://ollama.com/)

---

## 📖 Table of Contents
- [About DevOS](#-about-devos)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture & Data Flow](#-architecture--data-flow)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 About DevOS

Modern codebases are massive, complex, and constantly evolving. When developers join a new project, explore an open-source repository, or try to debug an unfamiliar microservice, they spend hours—sometimes days—just building mental models of the project's architecture.

**DevOS** solves this by combining a robust GitHub integration with a powerful Retrieval-Augmented Generation (RAG) pipeline. It securely indexes your repository and allows you to ask natural language questions about your architecture, authentication flows, or hidden bugs—all powered by a local LLM to ensure **zero data leakage**.

Whether you're a new hire onboarding, a tech lead reviewing architecture, or an open-source maintainer lowering the barrier to entry, DevOS makes code instantly explorable.

---

## ✨ Key Features

*   **🔒 Secure GitHub Integration:** Login via GitHub OAuth to instantly access your public and private repositories.
*   **🗂️ Interactive File Explorer:** An IDE-like sidebar with nested directory navigation, lazy loading, and syntax-highlighted code viewing.
*   **🤖 On-Demand File Explanation:** Select any complex file and instantly generate a zero-shot AI summary of its core logic, exports, and dependencies.
*   **💬 Chat with Your Repository (RAG):** Ask broad, repository-wide questions (e.g., *"How are JWT tokens validated?"*). DevOS performs a semantic search across the codebase, synthesizes an answer, and provides exact file citations.
*   **🛡️ Absolute Privacy:** Powered by local, open-weights models (via Ollama). Your proprietary code is never sent to third-party APIs for training.
*   **⚡ Blazing Fast Streaming:** AI responses are streamed character-by-character to the UI using Fetch Streaming for a seamless, immediate experience.

---

## 🛠️ Tech Stack

DevOS is built for scale, speed, and privacy.

**Frontend:**
*   **Next.js (App Router):** Leverages React Server Components (RSC) for fast initial loads and secure data fetching.
*   **Tailwind CSS:** Modern, ethereal glassmorphic UI design system.
*   **Zustand / React Context:** Global state management for file exploration and chat synchronization.

**Backend:**
*   **Node.js API Routes:** Secure orchestrator between GitHub, Supabase, and the local AI.
*   **NextAuth.js v5:** Robust session management and GitHub OAuth.

**Database & AI:**
*   **Supabase (PostgreSQL 15+):** Relational data mapping for users, repos, and chat histories.
*   **`pgvector`:** Vector database for storing 768-dimensional code embeddings (`nomic-embed-text`) and performing `ivfflat` semantic similarity searches.
*   **Ollama (`qwen`):** Local LLM engine handling both zero-shot file explanations and complex RAG synthesis.

---

## 📐 Architecture & Data Flow

DevOS is strictly partitioned into two AI operational pathways to maximize speed and minimize token overhead:

### 1. Zero-Shot File Explanation
When a user clicks "Explain this File", the raw text is sent directly to Ollama. It bypasses the vector database entirely to deliver an instant summary of the file's purpose.

### 2. RAG-Powered Repository Chat
For broad architectural questions, DevOS uses a complex indexing pipeline:
1.  **Index:** Files are fetched from GitHub, chunked (80 lines/chunk with 10-line overlap), embedded using `nomic-embed-text`, and stored in Supabase `pgvector`.
2.  **Retrieve:** User queries are embedded, and a cosine distance similarity search (`<=>`) retrieves the top-K most relevant code snippets.
3.  **Synthesize:** The snippets are injected into a prompt for the `qwen` model, which streams a contextual answer with exact file citations back to the client.

---

## 🚦 Getting Started

### Prerequisites
*   Node.js 18+
*   A [Supabase](https://supabase.com/) project with `pgvector` enabled.
*   [Ollama](https://ollama.com/) installed locally with the `qwen` and `nomic-embed-text` models pulled.
*   A GitHub OAuth App (Client ID and Secret).

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-org/devos.git
    cd devos
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env.local` file in the root directory:
    ```env
    # NextAuth (GitHub)
    AUTH_GITHUB_ID=your_github_client_id
    AUTH_GITHUB_SECRET=your_github_client_secret
    AUTH_SECRET=your_random_auth_secret

    # Supabase
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

    # Ollama (Local AI)
    OLLAMA_URL=http://localhost:11434
    ```

4.  **Database Migrations:**
    Run the Supabase SQL migrations located in `migrations/` to set up the database schemas, RLS policies, and the `match_chunks` RPC function for RAG retrieval.

5.  **Run the development server:**
    ```bash
    npm run dev
    ```
    Visit `http://localhost:3000` to start exploring.

---

## 📁 Project Structure

```text
devos/
├── app/                  # Next.js App Router (Pages, Layouts, API Routes)
│   ├── api/              # Node.js backend endpoints (Auth, GitHub, AI)
│   ├── dashboard/        # Authenticated user dashboard
│   └── repo/             # Main workspace (Explorer + Viewer + Chat)
├── components/           # Reusable React components
│   ├── chat/             # AI chat interface & Markdown parser
│   ├── explorer/         # File tree navigation
│   └── viewer/           # Syntax-highlighted code viewer
├── lib/                  # Utilities, DB clients, RAG logic
├── migrations/           # Supabase SQL schema definitions
├── project-docs/         # Architectural and product documentation
└── public/               # Static assets
```

---

## 🗺️ Roadmap

**Phase 1: MVP (Current)**
- [x] GitHub OAuth integration
- [x] Interactive File Tree Viewer
- [x] On-Demand File Explanation
- [x] Repository-wide Semantic Chat (RAG)

**Phase 2: Enhanced Context & Workflows**
- [ ] **Contextual Semantic Search:** Cmd+K to search code by *meaning*.
- [ ] **Multi-Repo Context:** Cross-repository architectural queries.
- [ ] **PR & Commit Summaries:** Auto-generated human-readable descriptions.
- [ ] **Architecture Generation:** Auto-generate Mermaid diagrams from codebase structure.

**Phase 3: Developer Action Layer**
- [ ] **Agentic Code Editing:** AI-proposed refactors with one-click PR generation.
- [ ] **IDE Extensions:** Bring DevOS intelligence directly to VS Code and JetBrains.
- [ ] **Proactive Auto-Fixes:** Background scanning for security flaws and anti-patterns.

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on how to submit pull requests, report issues, or request features.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
