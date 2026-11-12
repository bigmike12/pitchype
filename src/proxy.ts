import { NextResponse, type NextRequest } from "next/server";

import { refreshSession } from "@/lib/supabase/proxy";

// Pages that need a signed-in person. They check again themselves; this just
// sends people to the right place without rendering first.
// Each entry covers the page and everything under it (/campaigns/123).
const SIGNED_IN_ONLY = [
  "/home",
  "/account",
  "/onboarding",
  "/reset-password",
  "/profile",
  "/applications",
  "/inbox",
  "/admin",
  "/business",
  "/campaigns",
];
// Pages that make no sense once signed in.
const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  const { response, signedIn } = await refreshSession(request);
  const path = request.nextUrl.pathname;

  if (!signedIn && SIGNED_IN_ONLY.some((page) => isUnder(path, page))) {
    return redirectKeepingCookies(request, "/login", response);
  }
  if (signedIn && SIGNED_OUT_ONLY.includes(path)) {
    return redirectKeepingCookies(request, "/home", response);
  }
  return response;
}

const isUnder = (path: string, page: string) =>
  path === page || path.startsWith(`${page}/`);

function redirectKeepingCookies(
  request: NextRequest,
  pathname: string,
  from: NextResponse,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

// Only the routes that use the session. The landing page and legal pages
// never pass through here, so they stay static and fast. The directory is
// here so a business's session is fresh when it decides what they can see.
export const config = {
  matcher: [
    "/home",
    "/account",
    "/account/:path*",
    "/onboarding",
    "/reset-password",
    "/profile",
    "/applications",
    "/inbox",
    "/inbox/:path*",
    "/admin",
    "/business/:path*",
    "/campaigns",
    "/campaigns/:path*",
    "/creators",
    "/creators/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/auth/:path*",
  ],
};
