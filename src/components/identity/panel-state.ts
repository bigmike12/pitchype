// Which version of the identity section a person sees, from their checks. Pure
// so it can be tested; the section itself is identity-panel.tsx.

import type { IdentityCheckKind, IdentityCheckStatus } from "@/lib/db/identity";

export type PanelState =
  "none" | "in_progress" | "verified" | "failed" | "review" | "capped";

export type PanelCheck = {
  kind: IdentityCheckKind;
  status: IdentityCheckStatus;
  createdAt: string;
};

// The checks that make a person verified (the director check is separate and
// is not needed for either).
const KINDS: Record<"influencer" | "business", IdentityCheckKind[]> = {
  influencer: ["creator_nin"],
  business: ["owner_nin", "business_cac"],
};

/**
 * `capped` says the person has used their tries (the database's count, which
 * the page reads). A check in review or still being decided is never hidden
 * behind it, and a started session counts as nothing yet: they can resume it.
 */
export function identityPanelState(
  role: "influencer" | "business",
  checks: PanelCheck[],
  capped: boolean,
): PanelState {
  const mine = checks
    .filter((c) => KINDS[role].includes(c.kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (mine.some((c) => c.status === "verified")) return "verified";
  const latest = mine.find(
    (c) => c.status !== "started" && c.status !== "abandoned",
  );
  if (latest?.status === "needs_review") return "review";
  if (latest?.status === "pending") return "in_progress";
  if (capped) return "capped";
  if (latest?.status === "failed") return "failed";
  return "none";
}
