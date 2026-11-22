// Temporary: throws on purpose so the PostHog error report can be checked on
// prod. Delete this file once the $exception event has been seen.
// Reading the request makes the route dynamic, so the build does not run GET
// at build time, where the throw would fail the deploy.
export function GET(request: Request) {
  throw new Error(`PostHog prod test (${new URL(request.url).pathname})`);
}
