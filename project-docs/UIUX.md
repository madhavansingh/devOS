# DevOS Dashboard UI/UX Specifications
**Inspiration:** Modern SaaS AI Dashboard (Light Theme, Ethereal/Glassmorphic)

## 1. Layout Structure
The interface strongly relies on a spatial, floating feeling. Rather than strict, edge-to-edge structural blocks, components "float" over a soft background gradient.

*   **Left Sidebar (Slim Navigation):** 
    *   A narrow, detached vertical pill or strip containing essential icon-only navigation (Home, Repositories, Activity, Settings). 
    *   Icons are evenly spaced, with the active state indicated by a high-contrast circular background.
*   **Header (Context & Controls):** 
    *   Floating top bar containing context-specific actions.
    *   **Left:** Repository Selector / AI Model version toggle.
    *   **Center:** Current Page / Context Title (e.g., "DevOS Core").
    *   **Right:** Call to Action (e.g., "Upgrade" or "Connect GitHub") displayed as a dark, pill-shaped primary button.
*   **Main Content Canvas:**
    *   Large, welcoming typography centered or left-aligned at the top.
    *   **Features/Quick Actions (Cards):** A prominent horizontal layout of 3 tall, rounded cards.
    *   **AI Command Center (Anchored Bottom):** A floating, multi-layered chat/prompt bar anchored toward the bottom of the screen, housing the primary interaction paradigm.

## 2. Spacing and Alignment
*   **Whitespace:** Generous padding around the main canvas. The design breathes, avoiding dense clustering of information.
*   **Border Radius:** Soft, friendly curves everywhere. `rounded-2xl` or `rounded-3xl` for main cards, and full pill-shapes (`rounded-full`) for buttons and tags.
*   **Alignment:** 
    *   Main headline and cards are horizontally centered or constrained to a readable `max-w-5xl` container to prevent infinite stretching on widescreen displays.
    *   Text inside cards is left-aligned to maximize readability.

## 3. Color System
The visual tone is premium, calming, and state-of-the-art.
*   **Background:** Instead of solid white, the background uses a soft, ambient gradient. A mesh of `#F8FAFC` (slate-50) with ethereal hints of lavender (`#EEDCFF`), soft blue, and peach.
*   **Surfaces (Cards & Inputs):** 
    *   Foreground elements (cards, chat bar) are pure white (`#FFFFFF`) or slightly translucent to emulate frosted glass. 
    *   Subtle drop shadows (e.g., `box-shadow: 0 10px 40px -10px rgba(0,0,0,0.05)`) lift them off the gradient background.
*   **Typography Colors:**
    *   **Primary Text (Headings/Body):** Deep charcoal or navy (e.g., `#111827` or `#1E1E2E`) for very high contrast and sharp legibility.
    *   **Secondary Text (Tags/Footers):** Soft gray (`#6B7280`).
*   **Accents:**
    *   Buttons and primary interactive elements use the deep charcoal (`#1E1E2E`) with white text.
    *   Icons inside cards use vibrant, distinct brand colors (like GitHub's purple/black, React blue, etc.) for visual pop against the white surface.

## 4. Typography
*   **Font Family:** A highly legible, modern geometric sans-serif (e.g., **Inter, Plus Jakarta Sans,** or **Outfit**).
*   **Hierarchy:**
    *   **Hero Headline:** Large, bold weight (e.g., `text-4xl` or `text-5xl`), using color variation (e.g., "Hi Developer, **Ready to Explore?**") for emphasis.
    *   **Card Titles:** Medium weight, clean (`text-lg` or `text-xl`).
    *   **Body Copy:** Regular weight, slightly tighter line-height (`text-sm` or `text-base` with leading relaxed).
    *   **Microcopy:** Small (`text-xs`), uppercase, heavily letter-spaced tags for card footers.

## 5. Components
*   **Action Cards:**
    *   White background, rounded corners.
    *   Top: A 3D or flat, colorful icon.
    *   Middle: Actionable title and concise description (e.g., "Analyze Architecture").
    *   Bottom: A small, gray, uppercase categorizing label (e.g., "DEEP DIVE").
    *   *Surprise Element:* Some cards can have overlapping 3D elements (like an AI mascot or robot) breaking the top border of the card for playfulness.
*   **Primary Floating AI Input (The Command Center):**
    *   A massive, structured UI block floating at the bottom.
    *   **Top Bar:** Status indicator (e.g., "✨ Powered by DevOS v1.0 | Current Repo: facebook/react").
    *   **Middle Input Row:** Large, borderless text input with a placeholder (e.g., "Example: Explain the authentication flow..."). Includes a "+" button left, and a microphone + "Send" (dark circle) button right.
    *   **Bottom Chips Row:** Quick-action filter chips. Dark pill shapes with icons (e.g., "🔍 Deep Research", "📝 Summarize PRs", "💡 Find Bugs").
*   **Buttons:** Complete pill forms (fully rounded sides), using dark/black backgrounds for primary actions and soft gray/white for secondary.

## 6. UX Flow (DevOS Implementation)
1.  **Greeting & Context:** The user lands on the dashboard and is greeted by a large header ("Hi Alice, Ready to dive into your code?"). The background is calming, encouraging focus.
2.  **Prompted Discovery (Cards):** If the user doesn't know what to ask, the three central cards provide immediate value. They might suggest: "Explore Recent Commits", "Analyze Architecture", or "Find Security Vulnerabilities". Clicking a card instantly populates the chat input below.
3.  **Core Interaction (AI Chat Bar):** The anchored bottom command center is always accessible. The user types their technical question here. 
4.  **Quick Filters:** Below the input, the dark "suggestion chips" let the user quickly modify their query context (e.g., toggling "Search Entire Workspace" vs "Search Open File").
5.  **Seamless Transition:** Once a query is entered, the dashboard fluidly transitions: the main canvas slides away to reveal the **File Explorer** and **Chat Results** interface, moving from *Overview* mode to *Deep Work* mode, while the AI Input bar travels to dock at the bottom of the chat panel.
