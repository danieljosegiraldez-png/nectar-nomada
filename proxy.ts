import { NextResponse } from "next/server";
import { auth } from "./auth";

/**
 * SECURITY.md §2 — this is a UX convenience (redirect to /login), not the
 * authorization boundary itself. Every server action / route handler that
 * touches protected data re-checks via lib/rbac/service.ts regardless of
 * whether the request got this far, per "never rely exclusively on hidden
 * UI elements for authorization" (CLAUDE.md §56).
 */
const PROTECTED_PREFIXES = ["/my-nectar"];

export default auth((req) => {
  const isProtected = PROTECTED_PREFIXES.some((prefix) => req.nextUrl.pathname.startsWith(prefix));
  if (isProtected && !req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/my-nectar/:path*"],
};
