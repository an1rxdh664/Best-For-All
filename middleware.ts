import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export function middleware(req: any) {
  return auth(req as any);
}

export const config = {
  matcher: ["/api/protected/:path*", "/dashboard/:path*", "/chat/:path*"],
};