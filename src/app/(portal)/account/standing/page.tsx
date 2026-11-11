import {
  BadgeCheck,
  PauseCircle,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { getMyStanding, listMyAppeals } from "@/lib/db/moderation";
import { RESTRICT_DAYS, standingView } from "@/lib/moderation";
import { cn } from "@/lib/utils";

import { AppealForm } from "./appeal-form";

export const metadata: Metadata = { title: "Account standing" };

export default function StandingPage() {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading your account standing…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={3} />
          </PageLoading>
        }
      >
        <Standing />
      </Suspense>
    </div>
  );
}

async function Standing() {
  const user = await requireUser();
  const [standing, appeals] = await Promise.all([
    getMyStanding(user.id),
    listMyAppeals(user.id),
  ]);
  const view = standingView(standing, new Date());
  const openAppeal = appeals.find((a) => a.status === "open");
  const canAppeal = view.state !== "clear" && !openAppeal;

  return (
    <>
      <PageHeader
        title="Account standing"
        crumbs={[{ href: "/account", label: "Account" }]}
        lead="Messages with phone numbers, emails or links to other apps aren’t sent, and each one is a strike. One strike is a warning; two pause new activity for 3 days; three suspend your account until we review it."
      />

      {view.state === "clear" ? (
        <Callout tone="success" icon={BadgeCheck} title="All good">
          You have no strikes.
        </Callout>
      ) : view.state === "warned" ? (
        <Callout tone="attention" icon={TriangleAlert} title="Warning">
          You have {standing.activeStrikes} active{" "}
          {standing.activeStrikes === 1 ? "strike" : "strikes"}. Everything
          works as normal.
        </Callout>
      ) : view.state === "paused" ? (
        <Callout
          tone="danger"
          icon={PauseCircle}
          title="New activity is paused"
        >
          Until {view.until ? formatDateTime(view.until) : "soon"} you can’t
          send messages, apply or hire ({RESTRICT_DAYS} days after a second
          strike). Your existing work, campaigns and payments carry on.
        </Callout>
      ) : (
        <Callout tone="danger" icon={ShieldAlert} title="Suspended">
          We’re reviewing your account. Until then you can’t send messages,
          apply or hire. Your existing work, campaigns and payments carry on,
          and you keep what you’re owed.
        </Callout>
      )}

      {standing.strikes.length > 0 && (
        <section aria-labelledby="strikes-title" className="mt-8">
          <h2 id="strikes-title" className="text-display-md">
            Strikes
          </h2>
          <ul className="mt-4 divide-y divide-hairline rounded-card panel">
            {standing.strikes.map((s) => (
              <li key={s.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      "font-semibold text-ink",
                      s.voided && "line-through",
                    )}
                  >
                    Held back: {s.flag}
                  </p>
                  <p className="text-sm text-muted">
                    {formatDateTime(s.createdAt)}
                    {s.voided && " · removed on review"}
                  </p>
                </div>
                <blockquote className="mt-2 border-l-2 border-hairline pl-3 text-sm break-words whitespace-pre-line">
                  {s.detail}
                </blockquote>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">
            Only you and the Pitchype team see these messages; they were never
            delivered.
          </p>
        </section>
      )}

      {(canAppeal || appeals.length > 0) && (
        <section aria-labelledby="appeal-title" className="mt-10">
          <h2 id="appeal-title" className="text-display-md">
            Appeal
          </h2>
          {openAppeal && (
            <Callout
              tone="info"
              icon={TriangleAlert}
              title="We’re looking at your appeal"
              className="mt-4"
            >
              Sent {formatDateTime(openAppeal.createdAt)}. We’ll answer here.
            </Callout>
          )}
          {canAppeal && (
            <div className="mt-4 rounded-card panel p-5 sm:p-6">
              <AppealForm />
            </div>
          )}
          {appeals.some((a) => a.status === "answered") && (
            <ul className="mt-6 space-y-3">
              {appeals
                .filter((a) => a.status === "answered")
                .map((a) => (
                  <li key={a.id} className="rounded-card panel p-4 sm:p-5">
                    <p className="text-sm text-muted">
                      Your appeal of {formatDateTime(a.createdAt)}
                    </p>
                    <p className="mt-1 break-words whitespace-pre-line">
                      {a.message}
                    </p>
                    <p className="mt-3 font-semibold text-ink">Our answer</p>
                    <p className="mt-1 break-words whitespace-pre-line">
                      {a.answer}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
