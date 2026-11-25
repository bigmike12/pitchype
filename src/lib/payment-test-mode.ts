// Whether the money figures an admin is looking at come from Paystack's test
// credentials. Decided on the server from the key the app really uses, so the
// label can never disagree with what the app is talking to.
// Missing credentials count as test mode: nothing real can have moved.
// No framework imports, so node tests cover it.

type Env = Record<string, string | undefined>;

export function isPaymentTestMode(env: Env = process.env): boolean {
  const key = env.PAYSTACK_SECRET_KEY ?? "";
  return key === "" || key.startsWith("sk_test_");
}
