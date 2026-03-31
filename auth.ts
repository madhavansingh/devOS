import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { serverEnv } from "@/lib/env";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: serverEnv.GITHUB_CLIENT_ID,
      clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
      // Request read access to public + private repos
      authorization: {
        params: {
          scope: "read:user user:email repo",
        },
      },
    }),
  ],

  callbacks: {
    // Persist the GitHub access token and user data onto the session/JWT
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.githubLogin = (profile as { login?: string }).login;
        token.githubAvatarUrl = (profile as { avatar_url?: string }).avatar_url;
      }
      return token;
    },

    async session({ session, token }) {
      // Expose the fields the rest of the app needs
      session.accessToken = token.accessToken as string;
      session.user.githubLogin = token.githubLogin as string;
      session.user.image = token.githubAvatarUrl as string;
      return session;
    },
  },

  pages: {
    // Use our custom sign-in page
    signIn: "/login",
  },
});
