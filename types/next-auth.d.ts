import "next-auth";
import "next-auth/jwt";

// Extend the built-in NextAuth types to include GitHub-specific fields
declare module "next-auth" {
  interface Session {
    /** The GitHub OAuth access token — used to call GitHub API on behalf of the user */
    accessToken: string;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** GitHub username (login handle e.g. "octocat") */
      githubLogin: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    githubLogin?: string;
    githubAvatarUrl?: string;
  }
}
