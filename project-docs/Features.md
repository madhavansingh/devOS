# Features (MVP)
**Product Name:** DevOS
**Version:** 1.0 (MVP)

---

## 1. Authentication (GitHub OAuth)
**Feature Description:**
A secure login portal that authenticates users via their GitHub accounts. This ensures that DevOS can securely access public repositories and request the necessary permissions to read private repositories if authorized by the user.

**User Actions:**
*   User clicks "Login with GitHub" on the landing page.
*   User reviews the requested permissions on the GitHub authorization screen.
*   User clicks "Authorize" to grant DevOS read-only access to their repositories.
*   User can log out from the dashboard at any time.

**System Behavior:**
*   System redirects the user to the GitHub OAuth authorization endpoint.
*   Upon successful authorization, the system exchanges the OAuth code for an access token via the backend.
*   System securely encrypts and stores the access token in the database (or secure HTTP-only cookie).
*   System creates or updates the user profile globally and redirects the user to the DevOS Dashboard.

---

## 2. Repository Integration
**Feature Description:**
The core bridge between DevOS and GitHub. This module is responsible for retrieving a user's repository list, fetching specific repository metadata, and extracting the raw file and folder structures.

**User Actions:**
*   User views a list of their accessible repositories on the dashboard.
*   User clicks on a repository to open it.
*   Alternatively, user pastes a public GitHub repository URL into a search bar and presses "Enter".

**System Behavior:**
*   System calls the GitHub REST/GraphQL API using the user's access token to fetch the list of authorized repositories.
*   When a specific repository is selected, the system fetches the root directory structure (`GET /repos/{owner}/{repo}/contents`).
*   System handles GitHub API rate limiting gracefully, implementing necessary backoff strategies or caching.
*   System triggers background workers to begin fetching file blobs and indexing the repository for the AI Chat System (RAG pipeline).

---

## 3. Dashboard UI
**Feature Description:**
The central hub for the user after logging in. It provides an overview of their connected account, recent repositories explored, and a search interface to explore new repositories.

**User Actions:**
*   User navigates the list of "Recently Viewed" repositories.
*   User searches for a specific repository by name in the filter bar.
*   User views basic stats about a repository (e.g., star count, primary language, last updated) before opening it.

**System Behavior:**
*   System queries the database for the user's recently accessed repositories.
*   System dynamically filters the displayed repositories based on the user's search input.
*   System maintains state and ensures an instant, snappy transition when routing the user from the Dashboard to the File Explorer workspace.

---

## 4. File Explorer
**Feature Description:**
An IDE-like interface (Left Navigation Panel + Content Layout) that displays the hierarchical tree of the selected repository. It allows developers to browse folders, view code, and navigate the project visually.

**User Actions:**
*   User clicks on a folder in the left sidebar to expand or collapse it.
*   User clicks on a specific file to view its contents in the main center panel.
*   User views syntax-highlighted code with line numbers.

**System Behavior:**
*   System recursively renders the folder/file tree UI based on the structural data fetched from GitHub.
*   System caches folder expansions to prevent redundant API calls if navigating deep directories.
*   When a file is clicked, the system fetches the raw blob content from GitHub (if not already cached) and applies the appropriate syntax highlighting based on the file extension (e.g., `.ts`, `.py`, `.md`).
*   System updates the URL route (optional) to reflect the currently viewed file for easy sharing.

---

## 5. AI Chat System
**Feature Description:**
A conversational assistant interface located in the right panel. Powered by a Retrieval-Augmented Generation (RAG) pipeline, it allows users to ask broad or specific architectural questions about the entire repository.

**User Actions:**
*   User opens the "Chat" tab in the right-hand panel.
*   User types a natural-language question (e.g., "Where is the database connection instantiated?") and presses Enter.
*   User reads the generated response and clicks on any cited file links to jump directly to the relevant code.

**System Behavior:**
*   System takes the user's query and converts it into a vector embedding.
*   System searches the vector database (populated during the initial Repository Integration phase) for the most semantically relevant code chunks.
*   System constructs an LLM prompt containing the user's question and the retrieved code context.
*   System calls the LLM API and streams the response directly to the UI, character by character, to provide immediate feedback.
*   System parses the LLM output to convert file references into clickable UI links.

---

## 6. File Explanation Engine
**Feature Description:**
A targeted AI tool designed to explain a single, specific file. Rather than querying the whole repository, this engine takes the raw text of the currently open file and provides a concise summary of its logic, purpose, and key functions.

**User Actions:**
*   User opens a file (e.g., `utils/auth.ts`) in the File Explorer.
*   User clicks the "Explain File" button located above the code or in the right panel.
*   User reads the generated markdown summary, which breaks down the file's primary exports and dependencies.

**System Behavior:**
*   System captures the raw text content of the currently active file.
*   System constructs a prompt formatted for code explanation (e.g., *"Explain this file concisely. Highlight exports and core logic: [FILE CONTENT]"*).
*   System sends the prompt to the LLM (bypassing the RAG retrieval step since the context is exactly known).
*   System streams the explanation back to the user interface, rendering the markdown output safely.
*   System caches the explanation for this specific file commit hash so that subsequent requests for the exact same file load instantly.
