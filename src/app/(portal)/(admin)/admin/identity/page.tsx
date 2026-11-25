import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import {
  getScreeningState,
  getUserLabels,
  listCappedPeople,
  listIdentityReviewQueue,
  listUnclearScreenings,
  type IdentityCheckKind,
} from "@/lib/db/identity";
import { screeningQueues, type ScreeningRow } from "@/lib/identity-queue";

import { screenAgainAction } from "../money/actions";
import {
  allowRetryAction,
  reviewCheckAction,
  reviewScreeningAction,
} from "./actions";
import { DecisionForm } from "./decision-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Identity" };

export default function IdentityAdminPage() {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading identity checks…">
            <HeaderSkeleton />
            <SectionTitleSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
            <div className="mt-8">
              <SectionTitleSkeleton />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <IdentityAdmin />
      </Suspense>
    </div>
  );
}

const KIND_WORDS: Record<IdentityCheckKind, string> = {
  creator_nin: "Creator, NIN and selfie",
  owner_nin: "Business owner, NIN and selfie",
  business_cac: "Registered business, CAC",
  director_nin: "Director, NIN and selfie",
};

const REASON_WORDS: Record<string, string> = {
  duplicate_identity:
    "The same ID or registration number is already verified on another account.",
};

const TRIGGER_WORDS: Record<ScreeningRow["trigger"], string> = {
  first_payout: "first payout request",
  first_hire: "first hire approval",
  admin: "admin screening",
};

async function IdentityAdmin() {
  await requireRole("admin");
  const [checks, unclear, capped] = await Promise.all([
    listIdentityReviewQueue(),
    listUnclearScreenings(),
    listCappedPeople(),
  ]);
  const people = [...new Set(unclear.map((s) => s.userId))];
  const states = new Map(
    await Promise.all(
      people.map(async (id) => [id, await getScreeningState(id)] as const),
    ),
  );
  const { attention, confirmed } = screeningQueues(
    unclear,
    (id) => states.get(id) ?? "none",
  );
  const labels = await getUserLabels([
    ...new Set([
      ...checks.map((c) => c.userId),
      ...attention.map((s) => s.userId),
      ...confirmed.map((s) => s.userId),
      ...capped.map((c) => c.userId),
    ]),
  ]);
  const who = (userId: string) => {
    const label = labels.get(userId);
    return label
      ? `${label.name || "No name yet"} (${label.role === "influencer" ? "creator" : label.role})`
      : "Unknown account";
  };

  return (
    <>
      <PageHeader
        title="Identity"
        lead="Checks held for a person to look at, screenings that need a decision, and people who used up their tries. Facts are masked; the evidence is in Dojah’s dashboard under the reference."
      />

      <div className="space-y-6">
        <SectionCard id="checks-title" title="Checks in review" padded>
          <p className="mb-4 max-w-xl text-sm text-muted">
            Held because the same ID, or the same registration number, is
            already verified on another account. Dojah’s own manual reviews are
            decided in Dojah’s dashboard and arrive here as a normal result.
          </p>
          {checks.length === 0 ? (
            <p className="text-sm text-muted">Nothing waiting.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {checks.map((c) => (
                <li key={c.id} className="py-4 first:pt-0 last:pb-0">
                  <p className="font-semibold text-ink">{who(c.userId)}</p>
                  <p className="text-sm text-muted">{KIND_WORDS[c.kind]}</p>
                  <dl className="mt-2 space-y-0.5 text-sm">
                    {c.companyNameOnRecord ? (
                      <Fact
                        label="Company on record"
                        value={`${c.companyNameOnRecord}, ${c.registrationNumber ?? "no number"}`}
                      />
                    ) : (
                      <Fact
                        label="Legal name on record"
                        value={`${c.legalNameOnRecord ?? "none"}${c.idLast3 ? `, ID ending ${c.idLast3}` : ""}`}
                      />
                    )}
                    <Fact
                      label="Why it is held"
                      value={
                        REASON_WORDS[c.failureReason ?? ""] ??
                        c.failureReason ??
                        "Unknown"
                      }
                    />
                    <Fact label="Dojah reference" value={c.reference} />
                    <Fact label="Started" value={formatDateTime(c.createdAt)} />
                  </dl>
                  <div className="mt-3">
                    <DecisionForm
                      action={reviewCheckAction}
                      id={c.id}
                      hidden={{ name: "checkId", value: c.id }}
                      summary="Decide this check"
                      choices={[
                        { value: "verified", label: "Approve (verified)" },
                        {
                          value: "failed",
                          label: "Reject",
                          variant: "secondary",
                        },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard id="screenings-title" title="Screenings to decide" padded>
          <p className="mb-4 max-w-xl text-sm text-muted">
            A possible match blocks the creator’s payout approval, and a
            business’s first hire, until it is decided. An error blocks payouts
            until the person is screened again. Nobody is told a match was
            found.
          </p>
          {attention.length === 0 ? (
            <p className="text-sm text-muted">Nothing waiting.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {attention.map((s) => (
                <li key={s.id} className="py-4 first:pt-0 last:pb-0">
                  <p className="font-semibold text-ink">{who(s.userId)}</p>
                  <p className="text-sm text-muted">
                    {s.status === "possible_match"
                      ? `Possible match (${s.matchCount} ${s.matchCount === 1 ? "result" : "results"})`
                      : "Screening could not run"}
                    {" · "}
                    {TRIGGER_WORDS[s.trigger]}
                    {" · "}
                    {formatDateTime(s.createdAt)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-start gap-4">
                    {s.status === "possible_match" ? (
                      <DecisionForm
                        action={reviewScreeningAction}
                        id={s.id}
                        hidden={{ name: "screeningId", value: s.id }}
                        summary="Decide this match"
                        choices={[
                          { value: "cleared", label: "Clear it" },
                          {
                            value: "confirmed",
                            label: "Confirm the match",
                            variant: "secondary",
                          },
                        ]}
                      />
                    ) : null}
                    <form action={screenAgainAction}>
                      <input type="hidden" name="userId" value={s.userId} />
                      <Button type="submit" variant="secondary" size="sm">
                        Screen again
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {confirmed.length > 0 && (
            <div className="mt-6 border-t border-hairline pt-4">
              <h3 className="text-sm font-semibold text-ink">
                Confirmed matches
              </h3>
              <p className="mt-1 max-w-xl text-sm text-muted">
                Their payouts stay on hold. Suspending an account, and anything
                further, goes through{" "}
                <Link href="/admin/standing" className="link">
                  account standing
                </Link>{" "}
                and your own escalation process.
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {confirmed.map((s) => (
                  <li key={s.id} className="text-ink">
                    {who(s.userId)}, confirmed {formatDateTime(s.createdAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard id="capped-title" title="Used up their tries" padded>
          <p className="mb-4 max-w-xl text-sm text-muted">
            Three answered checks in a day, or five in total, close a check
            until an admin allows another. A daily cap lifts by itself.
          </p>
          {capped.length === 0 ? (
            <p className="text-sm text-muted">Nobody at the cap.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {capped.map((c) => (
                <li
                  key={`${c.userId}-${c.kind}`}
                  className="py-4 first:pt-0 last:pb-0"
                >
                  <p className="font-semibold text-ink">{who(c.userId)}</p>
                  <p className="text-sm text-muted">
                    {KIND_WORDS[c.kind]} · {c.answered} answered, last{" "}
                    {formatDateTime(c.lastAnsweredAt)} ·{" "}
                    {c.nextAllowedAt
                      ? `lifts ${formatDateTime(c.nextAllowedAt)}`
                      : "needs an admin"}
                  </p>
                  <div className="mt-3">
                    <DecisionForm
                      action={allowRetryAction}
                      id={`${c.userId}-${c.kind}`}
                      hidden={{ name: "userId", value: c.userId }}
                      summary="Allow another try"
                      choices={[{ value: "allow", label: "Allow another try" }]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-x-2 sm:flex-row">
      <dt className="text-muted sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="break-words text-ink">{value}</dd>
    </div>
  );
}
