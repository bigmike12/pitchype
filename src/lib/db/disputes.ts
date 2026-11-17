// Data access for disputes: one open dispute per hire, statements from both
// people, and an admin's decision. Writers are database functions called with
// the signed-in person's session (they check who may act and take the locks);
// reads go through the session too, so row level security decides what a
// person sees, and only then are the screenshots that came back signed.

import { proofFileUrls } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/server";

import { getEngagementDetails } from "./applications";
import { refused, type Result } from "./refusal";

// The generated types don't model SQL nulls for function arguments.
const nullable = <T>(value: T | null) => value as T;

export type DisputeOutcome =
  "release" | "refund" | "split" | "refund_creator_fault";

// Writes ---------------------------------------------------------------------------------------------------

/**
 * Either person opens a dispute (see `dispute_not_allowed_yet` for the
 * business's non-delivery case). The reason is also written as the opener's
 * first statement, carrying the links and screenshots. Returns the dispute id.
 */
export async function openDispute(
  engagementId: string,
  reason: string,
  links: string[],
  fileIds: string[],
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("open_dispute", {
    engagement: engagementId,
    reason,
    links,
    file_ids: fileIds,
  });
  if (error) return refused(error, "open dispute");
  return { ok: true, value: data };
}

/** Adds a statement to an open dispute; returns the statement id. */
export async function addDisputeStatement(
  disputeId: string,
  body: string,
  links: string[],
  fileIds: string[],
): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("add_dispute_statement", {
    dispute: disputeId,
    body,
    links,
    file_ids: fileIds,
  });
  if (error) return refused(error, "dispute statement");
  return { ok: true, value: data };
}

/** The person who opened a dispute withdraws it; the hire goes back where it was. */
export async function withdrawDispute(
  disputeId: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("withdraw_dispute", {
    dispute: disputeId,
  });
  if (error) return refused(error, "withdraw dispute");
  return { ok: true, value: null };
}

/**
 * An admin decides a dispute with a written reason. `releaseKobo` is the
 * amount released for a split; for the other outcomes pass null (the
 * database uses the whole price for a release and nothing for a refund).
 */
export async function decideDispute(
  disputeId: string,
  outcome: DisputeOutcome,
  releaseKobo: number | null,
  reason: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("decide_dispute", {
    dispute: disputeId,
    outcome,
    release_kobo: nullable<number>(releaseKobo),
    reason,
  });
  if (error) return refused(error, "decide dispute");
  return { ok: true, value: null };
}

// Reads ----------------------------------------------------------------------------------------------------

export type DisputeStatement = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: "creator" | "business" | "admin";
  body: string;
  links: string[];
  /** Signed, valid for 10 minutes, in the order they were uploaded. */
  files: { url: string }[];
  createdAt: string;
};

export type DisputeView = {
  id: string;
  engagementId: string;
  status: "open" | "withdrawn" | "decided";
  openedBy: string;
  openedFrom: "denied" | "in_progress";
  reason: string;
  openedAt: string;
  closedAt: string | null;
  /** How it ended: a settlement outcome, or accepted_by_business. */
  outcome: string | null;
  decisionReason: string | null;
  /** Oldest first; the first is the opener's own reason. */
  statements: DisputeStatement[];
};

/** One dispute with its statements, for either side or an admin; null if it isn't theirs. */
export async function getDispute(
  disputeId: string,
): Promise<DisputeView | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("disputes")
    .select(
      "id, engagement_id, status, opened_by, opened_from, reason, opened_at, closed_at, outcome, decision_reason, dispute_statements (id, author_id, body, links, created_at, proof_files (path, created_at))",
    )
    .eq("id", disputeId)
    .order("created_at", {
      ascending: true,
      referencedTable: "dispute_statements",
    })
    .order("created_at", {
      ascending: true,
      referencedTable: "dispute_statements.proof_files",
    })
    .maybeSingle();
  if (error) {
    // A malformed id is "not found", like the hire lookups.
    if (error.code === "22P02") return null;
    throw new Error(`dispute lookup failed (${error.code})`);
  }
  if (!data) return null;

  // Profiles aren't readable by the other side, so names come from the hire
  // page's own read, which returns both for either person and for admins.
  const hire = await getEngagementDetails(data.engagement_id);
  const whoIs = (id: string) => {
    if (id === hire?.creator.id) {
      return { name: hire.creator.name, role: "creator" as const };
    }
    if (id === hire?.business.id) {
      return { name: hire.business.name, role: "business" as const };
    }
    return { name: "Pitchype", role: "admin" as const };
  };

  const urls = await proofFileUrls(
    data.dispute_statements.flatMap((statement) =>
      statement.proof_files.map((file) => file.path),
    ),
  );
  return {
    id: data.id,
    engagementId: data.engagement_id,
    status: data.status as DisputeView["status"],
    openedBy: data.opened_by,
    openedFrom: data.opened_from as DisputeView["openedFrom"],
    reason: data.reason,
    openedAt: data.opened_at,
    closedAt: data.closed_at,
    outcome: data.outcome,
    decisionReason: data.decision_reason,
    statements: data.dispute_statements.map((statement) => {
      const author = whoIs(statement.author_id);
      return {
        id: statement.id,
        authorId: statement.author_id,
        authorName: author.name,
        authorRole: author.role,
        body: statement.body,
        links: statement.links,
        files: statement.proof_files.flatMap((file) => {
          const url = urls.get(file.path);
          return url ? [{ url }] : [];
        }),
        createdAt: statement.created_at,
      };
    }),
  };
}

/**
 * The newest dispute on a hire, open or closed, for either person on it or an
 * admin; null if there has never been one (or the hire isn't theirs). The
 * dispute pages are addressed by hire, because that is what notifications
 * link to.
 */
export async function getLatestDisputeId(
  engagementId: string,
): Promise<string | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("disputes")
    .select("id")
    .eq("engagement_id", engagementId)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`dispute lookup failed (${error.code})`);
  }
  return data?.id ?? null;
}

/** How many disputes are open, for the admin sidebar. Admins only (RLS). */
export async function countOpenDisputes(): Promise<number> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase
    .from("disputes")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  if (error) throw new Error(`disputes count failed (${error.code})`);
  return count ?? 0;
}

export type DisputeListRow = {
  id: string;
  engagementId: string;
  openedBy: string;
  openedByRole: "creator" | "business";
  openedFrom: "denied" | "in_progress";
  reason: string;
  openedAt: string;
  agreedPriceKobo: number;
  campaignTitle: string;
  businessName: string;
  creatorName: string;
};

export const DISPUTE_LIST_CAP = 200;

/**
 * Open disputes, oldest first, for admins. Row level security shows admins
 * every dispute, hire, campaign and profile, so this uses the session client.
 * It does not check the role: anyone else gets only their own open disputes
 * (RLS), so the page that calls it must require an admin.
 */
export async function listOpenDisputes(): Promise<{
  disputes: DisputeListRow[];
  /** There are open disputes beyond the cap (count them with countOpenDisputes). */
  more: boolean;
}> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("disputes")
    .select(
      "id, engagement_id, opened_by, opened_from, reason, opened_at, engagements (agreed_price_kobo, campaign_id, business_id, creator_id)",
    )
    .eq("status", "open")
    .order("opened_at", { ascending: true })
    .limit(DISPUTE_LIST_CAP + 1);
  if (error) throw new Error(`disputes lookup failed (${error.code})`);
  const more = data.length > DISPUTE_LIST_CAP;
  if (more) data.pop();
  if (data.length === 0) return { disputes: [], more: false };

  const hires = data.flatMap((row) =>
    row.engagements ? [row.engagements] : [],
  );
  const [campaigns, businesses, creators] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, title")
      .in("id", [...new Set(hires.map((h) => h.campaign_id))]),
    supabase
      .from("business_profiles")
      .select("user_id, business_name")
      .in("user_id", [...new Set(hires.map((h) => h.business_id))]),
    supabase
      .from("influencer_profiles")
      .select("user_id, display_name")
      .in("user_id", [...new Set(hires.map((h) => h.creator_id))]),
  ]);
  for (const result of [campaigns, businesses, creators]) {
    if (result.error) {
      throw new Error(`disputes lookup failed (${result.error.code})`);
    }
  }
  const titles = new Map(campaigns.data?.map((c) => [c.id, c.title]));
  const businessNames = new Map(
    businesses.data?.map((b) => [b.user_id, b.business_name]),
  );
  const creatorNames = new Map(
    creators.data?.map((c) => [c.user_id, c.display_name]),
  );

  const disputes = data.flatMap((row): DisputeListRow[] => {
    const hire = row.engagements;
    if (!hire) return [];
    return [
      {
        id: row.id,
        engagementId: row.engagement_id,
        openedBy: row.opened_by,
        openedByRole:
          row.opened_by === hire.creator_id ? "creator" : "business",
        openedFrom: row.opened_from as DisputeListRow["openedFrom"],
        reason: row.reason,
        openedAt: row.opened_at,
        agreedPriceKobo: hire.agreed_price_kobo,
        campaignTitle: titles.get(hire.campaign_id) ?? "",
        businessName: businessNames.get(hire.business_id) ?? "",
        creatorName: creatorNames.get(hire.creator_id) ?? "",
      },
    ];
  });
  return { disputes, more };
}
