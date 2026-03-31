import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Protect all /dashboard and /repo routes
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/repo");

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If already logged in, redirect away from login page
  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Run middleware on these paths only (exclude static files & api/auth)
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
