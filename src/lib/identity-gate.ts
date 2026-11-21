// The words around the identity gates (design §5.7). The gates themselves are
// in the database (apply, hire, publish, withdraw); this is only what the
// pages say about them, so a disabled button always says why.

export const IDENTITY_FIRST = "Confirm your identity first";

/** The portal banner for someone who is not verified yet, or null when there is nothing to say. */
export function identityBanner(
  role: "business" | "influencer" | "admin",
  verified: boolean,
): string | null {
  if (verified || role === "admin") return null;
  return role === "influencer"
    ? "Confirm your identity to apply for campaigns and withdraw your earnings"
    : "Confirm your identity to publish campaigns and hire creators";
}
