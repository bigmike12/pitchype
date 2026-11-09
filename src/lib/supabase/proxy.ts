import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "./env";

/**
 * Refreshes the Supabase session cookies for this request (Server Components
 * can't) and reports whether a valid session exists. Pages still check the
 * user themselves; this answer is only good enough for redirects.
 */
export async function refreshSession(
  request: NextRequest,
): Promise<{ response: NextResponse; signedIn: boolean }> {
  const { url, publishableKey } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Hand the refreshed cookies both to the page about to render and to
        // the browser.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Nothing may run between creating the client and this call (Supabase's
  // guidance); getClaims() is what triggers the refresh.
  const { data } = await supabase.auth.getClaims();

  return { response, signedIn: Boolean(data?.claims) };
}
