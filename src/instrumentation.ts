import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import type { Instrumentation } from "next";

import { reportServerError } from "@/lib/observability";

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const posthogLogsUrl = posthogHost
  ? `${posthogHost.replace(/\/+$/, "")}/i/v1/logs`
  : undefined;

if (process.env.NODE_ENV !== "production") {
  if (!posthogToken) {
    console.warn(
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
    );
  }
  if (!posthogHost) {
    console.warn(
      "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
    );
  }
}

// This dedicated provider intentionally exports only records emitted through
// posthogLogger. Existing console and application loggers stay untouched.
export const posthogLoggerProvider =
  posthogToken && posthogLogsUrl
    ? new LoggerProvider({
        resource: resourceFromAttributes({ "service.name": "pitchype" }),
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: posthogLogsUrl,
              timeoutMillis: 2_000,
              headers: {
                Authorization: `Bearer ${posthogToken}`,
                "Content-Type": "application/json",
              },
            }),
          }),
        ],
      })
    : undefined;

const posthogLogger = posthogLoggerProvider?.getLogger("pitchype.posthog");

export function logPostHogInfo(
  body: string,
  attributes: Record<string, boolean | number | string>,
): void {
  posthogLogger?.emit({
    body,
    severityNumber: SeverityNumber.INFO,
    attributes,
  });
}

export async function flushPostHogLogs(): Promise<void> {
  await posthogLoggerProvider?.forceFlush().catch(() => {});
}

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
