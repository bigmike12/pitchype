import { headers } from "next/headers";

/**
 * The visitor's IP, for rate limiting. Vercel sets x-forwarded-for itself,
 * with the client's address first. Self-hosted, the proxy in front must set
 * or overwrite it, or every visitor shares one "unknown" bucket.
 */
export async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || requestHeaders.get("x-real-ip") || "unknown";
}
