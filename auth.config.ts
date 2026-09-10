// auth.config.ts
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize() {
        return null;
      },
    }),
  ],
  // Crucial: Force NextAuth to use stateless JWT tokens 
  // so the middleware does not attempt database lookups.
  session: {
    strategy: "jwt",
  },
  // Auth secret and host trust for Auth.js
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  callbacks: {
    authorized({ request, auth }) {
      const isLoggedIn = !!auth;
      const isOnDashboard = request.nextUrl.pathname.startsWith("/dashboard");
      const isInChat = request.nextUrl.pathname.startsWith("/chat");

      if (!isLoggedIn && (isOnDashboard || isInChat)) return false;
      return true;
    },
  },
  pages: {
    signIn: "/api/auth/login",
  },
} satisfies NextAuthConfig;
