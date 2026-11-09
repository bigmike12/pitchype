import { NextResponse, type NextRequest } from "next/server";

import { repairSession } from "@/lib/auth";

// requireUser() sends people here when they're signed in but have no app user
// yet (for example if creating it failed when they confirmed their email).
// Create it now, or sign them out so they can start again.
export async function GET(request: NextRequest) {
  const repaired = await repairSession();
  const destination = request.nextUrl.clone();
  destination.search = "";
  destination.pathname = repaired ? "/onboarding" : "/login";
  return NextResponse.redirect(destination);
}
