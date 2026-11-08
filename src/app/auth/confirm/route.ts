import { NextResponse, type NextRequest } from "next/server";

import { verifyEmailLink } from "@/lib/auth";

// Emailed links land here (supabase/templates/*.html): a sign-up
// confirmation (type=email) or a password reset (type=recovery). Where to go
// next depends only on the type, never on a URL parameter, so the link can't
// be turned into a redirect to another site.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  const verified =
    tokenHash !== null &&
    (type === "email" || type === "recovery") &&
    (await verifyEmailLink(tokenHash, type));

  const destination = request.nextUrl.clone();
  destination.search = "";
  destination.pathname = !verified
    ? "/link-expired"
    : type === "recovery"
      ? "/reset-password"
      : "/onboarding";
  return NextResponse.redirect(destination);
}
