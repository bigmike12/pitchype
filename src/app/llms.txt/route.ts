import { buildLlmsTxt } from "@/lib/llms";

// A static file for AI assistants (see src/lib/llms.ts). Plain text, so a
// browser shows it instead of downloading it.
export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
