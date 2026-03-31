import { handlers } from "@/auth";

// Export NextAuth's built-in GET/POST handlers
// This single file handles: /api/auth/signin, /api/auth/callback/github, etc.
export const { GET, POST } = handlers;
