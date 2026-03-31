# Technology Stack (MVP)
**Product Name:** DevOS
**Version:** 1.0 (MVP)

Below is the approved technology stack for the DevOS platform, outlining each tool, its specific role, and why it was chosen for this Minimum Viable Product.

---

## 1. Next.js (Frontend Framework)
**Role:** The core React framework responsible for rendering the User Interface (the Dashboard, File Explorer, and Chat UI) and managing client-side routing.

**Why it was chosen:**
*   **React Server Components (RSC):** Allows DevOS to securely pre-fetch repository data on the server before transmitting UI to the client, leading to faster initial loads of complex file trees.
*   **Unified Full-Stack Experience:** Developers can build the UI and the backend logic in the same repository.
*   **SEO & Perceived Rendering Performance:** Ensures the landing page and public repository pages load quickly and are crawlable.

---

## 2. Tailwind CSS (Styling)
**Role:** The utility-first CSS framework used for all UI components, spacing, and layout management.

**Why it was chosen:**
*   **Rapid Prototyping:** Crucial for building the complex, IDE-like interfaces (File Explorer, Chat Sidebar) quickly without leaving the JSX files.
*   **Design System Consistency:** Enforces a strict, customizable design system out of the box (e.g., standardizing the spacing, soft border radii, and glassmorphic colors identified in the UI/UX spec).
*   **Performance:** Automatically purges unused CSS in production, keeping the bundle size microscopic.

---

## 3. Node.js API Routes (Next.js Backend)
**Role:** The backend server logic running attached to the Next.js application (using `app/api/...` conventions).

**Why it was chosen:**
*   **Seamless Integration:** Exists in the same repository as the frontend, enabling rapid MVP iteration.
*   **Middleware & Proxies:** Perfect for acting as a secure proxy between the browser client and sensitive external services (GitHub API, Ollama AI, Supabase).
*   **Orchestration:** Handles the heavy lifting of receiving a user's prompt, triggering the RAG retrieval from Supabase, constructing the combined prompt, and pinging the Ollama local model. It also supports HTTP streaming, which is required for streaming AI text responses back to the chat UI.

---

## 4. Supabase (Database & Authentication)
**Role:** Provides the Postgres database, User Authentication (OAuth), and Vector Storage capabilities.

**Why it was chosen:**
*   **Postgres + `pgvector`:** Essential for the RAG pipeline. Supabase natively supports `pgvector`, allowing DevOS to securely store and perform high-speed similarity searches on code embeddings.
*   **GitHub OAuth:** Supabase Auth provides an out-of-the-box configuration for GitHub login. The secure session handling maps GitHub users to internal DevOS database rows instantly.
*   **Real-time & PostgreSQL:** Robust, horizontally scalable relational database to map Users to indexed Repositories and store Chat Context Histories.

---

## 5. GitHub API (Data Source)
**Role:** The external system of record from which all raw data (repositories, folders, text blobs, statistics) is sourced.

**Why it was chosen:**
*   **Indispensable:** DevOS is inherently a GitHub intelligence tool. Using their REST (or GraphQL) API is the only standard, secure way to access public and private repository trees for an authenticated user.
*   **Webhooks (Future-proofing):** Provides options to listen to repo changes in the future (Phase 2), ensuring the DevOS index remains synchronized with code changes.

---

## 6. Ollama using the `qwen` model (AI Engine)
**Role:** The Local/Self-hosted Large Language Model (LLM) engine responsible for generating all File Explanations and Repository Chat responses.

**Why it was chosen:**
*   **Data Privacy (Crucial for Code):** By running the model locally/privately via Ollama, DevOS ensures that the user's proprietary or private source code is *never* sent to third-party APIs (like OpenAI) where it might be logged or used for training.
*   **`qwen` Model Architecture:** The Qwen family of models has demonstrated exceptional capabilities in logical reasoning, coding tasks, and multi-lingual processing. A highly capable coder model guarantees high-quality architectural explanations and accurate code references.
*   **Cost Efficiency for MVP:** Using an open-weights model drastically reduces token inference costs during the heavy repository-indexing and testing phases of the MVP.
