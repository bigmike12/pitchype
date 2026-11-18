// A creator's tracked link: record the hit, then send the visitor to the
// business's page. Always a 302 with no-store, so browsers don't cache the
// redirect and skip the count. Decisions are in ./redirect.ts.

import { lookupDestination, recordClick } from "@/lib/db/clicks";

import { handleLinkHit } from "./redirect";

const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link not found · Pitchype</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #18181b">
<h1 style="font-size: 1.25rem">This link couldn’t be opened</h1>
<p>It may be mistyped, or it may have been removed. If you followed it from a post, try again in a minute.</p>
</body></html>`;

async function handle(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  // As in src/lib/client-ip.ts: Vercel sets x-forwarded-for with the client
  // first; self-hosted, the proxy in front must set it.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const result = await handleLinkHit(
    { code, method: request.method, ip, headers: request.headers },
    {
      secret: process.env.CLICK_HASH_SECRET,
      record: recordClick,
      lookup: lookupDestination,
      log: (line) => console.error(line),
    },
  );

  if (result.status === 404) {
    return new Response(NOT_FOUND_PAGE, {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: result.location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer-when-downgrade",
    },
  });
}

export { handle as GET, handle as HEAD };
