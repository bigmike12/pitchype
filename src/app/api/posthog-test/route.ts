// Temporary: throws on purpose so the PostHog error report can be checked on
// prod. Delete this file once the $exception event has been seen.
export function GET() {
  throw new Error("PostHog prod test");
}
