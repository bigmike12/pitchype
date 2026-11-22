import type { Instrumentation } from "next";

import { reportServerError } from "@/lib/observability";

// Next.js calls this for every error thrown while serving a request: pages,
// Server Actions and route handlers. A route that returns a 500 without
// throwing is not seen here; the money-checks job reports its own failures.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await reportServerError(error, `${request.method} ${context.routePath}`);
};
