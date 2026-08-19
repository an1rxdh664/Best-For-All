// proxy.ts
export { auth as middleware } from "@/auth";

export const config = {
  // Apply middleware to specific protected backend routes or dashboard paths
  matcher: ["/api/protected/:path*", "/dashboard/:path*", "/chat/:path*"],
};