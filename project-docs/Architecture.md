# System Architecture (MVP)
**Product Name:** DevOS
**Version:** 1.0 (MVP)

The architecture of DevOS is clean, component-driven, and highly scalable. It separates the rapidly iteratively Next.js React frontend from the computationally heavy Node.js API routes that orchestrate AI generation and GitHub integrations.

---

## 1. Frontend Structure (Next.js & Tailwind)
The frontend relies heavily on modern Next.js `app` directory conventions to leverage Server Components (RSC) where possible, falling back to Client Components (`"use client"`) for highly interactive UI elements.
*   **`app/page.tsx`:** The marketing landing page leading to authentication.
*   **`app/dashboard/page.tsx`:** (RSC) Fetches the user's repository list server-side.
*   **`app/repo/[owner]/[name]/layout.tsx`:** The core DevOS workspace wrapper (holds the Sidebar, Header, and Chat layout).
*   **`components/explorer/`:** (Client) The interactive File Tree, managing state for expanded/collapsed folders and the active selected file.
*   **`components/chat/`:** (Client) The AI interaction layer. Manages the prompt input, maintains local chat message history, and handles the Markdown streaming parser.
*   **`components/viewer/`:** (Client) The code display panel featuring syntax highlighting libraries.
*   **State Management:** React Context or Zustand is used to globally track the currently selected file path, allowing the `explorer`, `viewer`, and `chat` components to communicate without heavy prop-drilling.

---

## 2. Backend API Structure (Node.js API Routes)
The backend acts as a secure orchestrator between the database, GitHub, and the local AI model.
*   **`app/api/auth/[...nextauth]/route.ts` OR Supabase Auth Route:** Handles the GitHub OAuth flow and issues secure session tokens.
*   **`app/api/github/tree/route.ts`:** Proxies requests to GitHub's REST API, retrieving the nested directory structure of a repo and handling API token injection.
*   **`app/api/ai/explain/route.ts`:** Receives a file's raw text content and streams back an explanation from Ollama.
*   **`app/api/ai/chat/route.ts`:** The core RAG endpoint. Receives a user's natural language query, performs the vector similarity search on Supabase, and streams the synthesized response.
*   **Background Worker (Edge/Serverless):** An asynchronous job (e.g., triggered via Upstash message queue) that downloads a repo's files, chunks the text, creates embeddings using a small embedding model, and persists them to Supabase `pgvector`. 

---

## 3. Data Flow
1.  **Auth Flow:** User clicks Login -> Redirect to GitHub -> GitHub redirects to DevOS callback -> DevOS exchanges code for an Access Token -> Saves user profile and token to Supabase -> Issues secure session cookie.
2.  **Repo Initialization Flow:** 
    *   User selects Repo "A".
    *   Frontend sends request to `api/github/tree`.
    *   Backend fetches GitHub metadata and returns the JSON tree structure to the Frontend.
    *   Frontend renders the File Explorer.
    *   *Simultaneously*, if Repo "A" is not indexed, the Backend pushes it into the ingestion queue.
3.  **Chat Interaction Flow:** User types "Find auth logic" -> Frontend sends query to `api/ai/chat` -> API generates embedding of the query -> API queries Supabase `pgvector` for nearest chunks -> Supabase returns code chunks -> API constructs final instruction prompt -> API sends prompt to Ollama -> API streams Ollama response to Frontend via Server-Sent Events (SSE).

---

## 4. AI Flow (Chat & File Explanation)
The AI system is strictly partitioned into two separate operational pathways to minimize token usage and maximize response speed:

### A. File Explanation (Zero-Shot / Direct Context)
**Use Case:** User clicks "Explain this File".
- The frontend holds the raw string data of the currently opened file.
- The frontend POSTs this raw string to `api/ai/explain`.
- **System Prompt:** *"You are a senior engineer. Explain the purpose, core functions, and exports of the following code. Code: [RAW_FILE_TEXT]"*
- The Node.js backend passes this prompt directly to the Ollama (qwen) engine.
- Result streams back directly. **No vector database retrieval is involved.**

### B. Chat with Repository (RAG / Retrieved Context)
**Use Case:** User asks a broad question ("How are users authenticated in this app?").
- The repository must have been previously indexed (Chunked -> Embedded -> Stored in Supabase `pgvector`).
- The frontend POSTs the question to `api/ai/chat`.
- The backend converts the user's exact question string into a vector embedding.
- The backend runs a similarity search on the Supabase database matching the Repo ID.
- Supabase returns the Top-K (e.g., top 5) most semantically relevant code chunks (e.g., snippets from `auth.ts`, `middleware.ts`, `jwt_utils.ts`).
- **System Prompt:** *"You are DevOS, an AI architect. Answer the user's question accurately using ONLY the following retrieved code snippets. Include file paths in your answer. Context Snippets: [CHUNK_1], [CHUNK_2], etc. Question: [USER_QUESTION]"*
- The backend sends this massive, generated prompt to the Ollama engine.
- The conversational result streams back to the UI.

---

## 5. Integration with GitHub
Integration is stateless where possible to respect API limits and prioritize real-time data:
*   **Authentication Scope:** Requires the `repo` scope to read private repositories (if the user opts-in), or `public_repo` for open-source exploration.
*   **API Usage (REST/GraphQL):** The backend relies heavily on the `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` endpoint. This returns the entire file structure instantly in a single, lightweight JSON payload.
*   **Raw File Fetching:** When a user clicks a specific file in the UI, the frontend calls the raw `raw.githubusercontent.com` endpoint (or a proxy route) to load just that file, preventing DevOS from needing to store millions of lines of code locally merely for viewing.
