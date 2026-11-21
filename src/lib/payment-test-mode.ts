// Whether the money figures an admin is looking at come from a provider's test
// credentials. Decided on the server from the active provider's own settings,
// so the label can never disagree with what the app is really talking to.
// Missing credentials count as test mode: nothing real can have moved.
// No framework imports, so node tests cover it.

import type { PaymentProvider } from "./db/money.ts";

type Env = Record<string, string | undefined>;

export function isPaymentTestMode(
  provider: PaymentProvider,
  env: Env = process.env,
): boolean {
  if (provider === "cray") {
    return (env.CRAY_BASE_URL ?? "").includes("sandbox") || !env.CRAY_BASE_URL;
  }
  const key = env.PAYSTACK_SECRET_KEY ?? "";
  return key === "" || key.startsWith("sk_test_");
}
