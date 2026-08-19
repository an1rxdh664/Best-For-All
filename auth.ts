// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    // Modify JWT token or session if you need custom backend fields (e.g., user roles, db IDs)
    async jwt({ token, user }) {
        if (user) {
            token.id = user.id;
        }
        return token;
    },
    async session({ session, token }) {
        if (session.user && token.id) {
            session.user.id = token.id as string;
        }
        return session;
    },
    authorized({ request, auth }) {
        const isLoggedIn = !!auth;
        const isOnDashboard = request.nextUrl.pathname.startsWith("/dashboard");
        const isInChat = request.nextUrl.pathname.startsWith("/chat");

        if (!isLoggedIn && (isOnDashboard || isInChat)) return false;
        return true;
    },
  },
  pages : {
    signIn: "/api/auth/login",
  },
});