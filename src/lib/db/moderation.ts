// Data access for account standing, blocks and appeals.
//
// Standing changes only in the database (see the create_moderation
// migration): people read their own record and log; admins decide through
// functions that require a reason.

import type { Standing } from "@/lib/moderation";
import { createSessionClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { bool, isObject, list, num, obj, str } from "./json";
import { refused, type Refused } from "./refusal";

type Result<T> = { ok: true; value: T } | Refused;

export type StrikeRecord = {
  id: string;
  flag: string;
  detail: string;
  createdAt: string;
  voided: boolean;
};

export type StandingRecord = Standing & { strikes: StrikeRecord[] };

/** The signed-in person's standing and strikes. */
export async function getMyStanding(userId: string): Promise<StandingRecord> {
  const supabase = await createSessionClient();
  const [user, events] = await Promise.all([
    supabase
      .from("users")
      .select("messaging_restricted_until, suspended_at")
      .eq("id", userId)
      .single(),
    supabase
      .from("moderation_events")
      .select("id, kind, strike_id, flag, detail, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  if (user.error) throw new Error(`standing failed (${user.error.code})`);
  if (events.error) throw new Error(`strikes failed (${events.error.code})`);

  const voided = new Set(
    events.data
      .filter((e) => e.kind === "strike_voided")
      .map((e) => e.strike_id),
  );
  const strikes = events.data
    .filter((e) => e.kind === "strike")
    .map((e) => ({
      id: e.id,
      flag: e.flag ?? "",
      detail: e.detail ?? "",
      createdAt: e.created_at,
      voided: voided.has(e.id),
    }));
  return {
    activeStrikes: strikes.filter((s) => !s.voided).length,
    restrictedUntil: user.data.messaging_restricted_until,
    suspendedAt: user.data.suspended_at,
    strikes,
  };
}

export type Appeal = {
  id: string;
  message: string;
  status: "open" | "answered";
  answer: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export async function listMyAppeals(userId: string): Promise<Appeal[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("moderation_appeals")
    .select("id, message, status, answer, created_at, resolved_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`appeals failed (${error.code})`);
  return data.map((a) => ({
    id: a.id,
    message: a.message,
    status: a.status === "open" ? "open" : "answered",
    answer: a.answer,
    createdAt: a.created_at,
    resolvedAt: a.resolved_at,
  }));
}

export async function submitAppeal(message: string): Promise<Result<string>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("submit_appeal", { message });
  if (error) return refused(error, "appeal");
  return { ok: true, value: data };
}

// Blocks ------------------------------------------------------------------------------------

export type BlockedPerson = {
  id: string;
  role: string;
  name: string;
  createdAt: string;
};

export async function listMyBlocks(): Promise<BlockedPerson[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("my_blocks");
  if (error) throw new Error(`blocks failed (${error.code})`);
  return list(data).flatMap((row) =>
    isObject(row) && str(row.id)
      ? [
          {
            id: str(row.id) ?? "",
            role: str(row.role) ?? "",
            name: str(row.name) ?? "",
            createdAt: str(row.created_at) ?? "",
          },
        ]
      : [],
  );
}

export async function blockUser(otherId: string): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("block_user", { other: otherId });
  if (error) return refused(error, "block");
  return { ok: true, value: null };
}

export async function unblockUser(otherId: string): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("unblock_user", { other: otherId });
  if (error) throw new Error(`unblock failed (${error.code})`);
}

// Admin review ---------------------------------------------------------------------------------

export type ReviewStrike = StrikeRecord & {
  userId: string;
  email: string;
  name: string;
};

export type StandingReview = {
  suspended: {
    userId: string;
    email: string;
    role: string;
    name: string;
    suspendedAt: string;
    strikes: StrikeRecord[];
    campaigns: { id: string; title: string; status: string }[];
    engagements: {
      id: string;
      status: string;
      agreedPriceKobo: number;
      campaignTitle: string;
    }[];
  }[];
  appeals: {
    id: string;
    userId: string;
    email: string;
    name: string;
    message: string;
    createdAt: string;
    activeStrikes: number;
    suspended: boolean;
  }[];
  recentStrikes: ReviewStrike[];
};

function toStrike(value: Json | undefined): StrikeRecord | null {
  if (!isObject(value)) return null;
  return {
    id: str(value.id) ?? "",
    flag: str(value.flag) ?? "",
    detail: str(value.detail) ?? "",
    createdAt: str(value.created_at) ?? "",
    voided: bool(value.voided),
  };
}

export async function getStandingReview(): Promise<StandingReview> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("standing_review");
  if (error) throw new Error(`standing review failed (${error.code})`);
  const review = obj(data);
  return {
    suspended: list(review.suspended).flatMap((row) => {
      if (!isObject(row)) return [];
      return [
        {
          userId: str(row.user_id) ?? "",
          email: str(row.email) ?? "",
          role: str(row.role) ?? "",
          name: str(row.name) ?? "",
          suspendedAt: str(row.suspended_at) ?? "",
          strikes: list(row.strikes).flatMap((s) => toStrike(s) ?? []),
          campaigns: list(row.campaigns).flatMap((k) =>
            isObject(k)
              ? [
                  {
                    id: str(k.id) ?? "",
                    title: str(k.title) ?? "",
                    status: str(k.status) ?? "",
                  },
                ]
              : [],
          ),
          engagements: list(row.engagements).flatMap((e) =>
            isObject(e)
              ? [
                  {
                    id: str(e.id) ?? "",
                    status: str(e.status) ?? "",
                    agreedPriceKobo: num(e.agreed_price_kobo) ?? 0,
                    campaignTitle: str(e.campaign_title) ?? "",
                  },
                ]
              : [],
          ),
        },
      ];
    }),
    appeals: list(review.appeals).flatMap((row) =>
      isObject(row)
        ? [
            {
              id: str(row.id) ?? "",
              userId: str(row.user_id) ?? "",
              email: str(row.email) ?? "",
              name: str(row.name) ?? "",
              message: str(row.message) ?? "",
              createdAt: str(row.created_at) ?? "",
              activeStrikes: num(row.active_strikes) ?? 0,
              suspended: bool(row.suspended),
            },
          ]
        : [],
    ),
    recentStrikes: list(review.recent_strikes).flatMap((row) => {
      const strike = toStrike(row);
      if (!strike || !isObject(row)) return [];
      return [
        {
          ...strike,
          userId: str(row.user_id) ?? "",
          email: str(row.email) ?? "",
          name: str(row.name) ?? "",
        },
      ];
    }),
  };
}

export async function voidStrike(
  strikeId: string,
  reason: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("void_strike", {
    strike: strikeId,
    reason,
  });
  if (error) return refused(error, "void strike");
  return { ok: true, value: null };
}

export async function liftSuspension(
  userId: string,
  reason: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("lift_suspension", {
    person: userId,
    reason,
  });
  if (error) return refused(error, "lift suspension");
  return { ok: true, value: null };
}

export async function answerAppeal(
  appealId: string,
  answer: string,
  decline: boolean,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("answer_appeal", {
    appeal: appealId,
    answer,
    decline,
  });
  if (error) return refused(error, "answer appeal");
  return { ok: true, value: null };
}
