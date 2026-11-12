import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { listMyBlocks } from "@/lib/db/moderation";
import { getProfile } from "@/lib/db/profiles";

import { signOutAction } from "../actions";
import { updateProfileAction } from "./actions";
import { BlockControl } from "./block-control";
import { ProfileForm } from "./profile-form";
import {
  FormSkeleton,
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Account" };

const ROLE_LABELS = {
  business: "Business",
  influencer: "Creator",
  admin: "Admin",
} as const;

export default function AccountPage() {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading your account…">
            <HeaderSkeleton />
            <PanelSkeleton lines={2} />
            <FormSkeleton fields={3} className="mt-4" />
          </PageLoading>
        }
      >
        <Account />
      </Suspense>
    </div>
  );
}

// Settings: sign-in details, the business profile (creators edit theirs on
// /profile), and signing out.
async function Account() {
  const user = await requireUser();
  const [profile, blocks] = await Promise.all([
    getProfile(user),
    user.role === "admin" ? Promise.resolve([]) : listMyBlocks(),
  ]);
  if (!profile && user.role !== "admin") redirect("/onboarding");

  return (
    <>
      <PageHeader title="Account" />

      <div className="space-y-6">
        <Section id="sign-in" title="Sign-in">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Email</dt>
              <dd className="mt-1 font-semibold break-all text-ink">
                {user.email}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Account type</dt>
              <dd className="mt-1 font-semibold text-ink">
                {ROLE_LABELS[user.role]}
              </dd>
            </div>
          </dl>
        </Section>

        {profile?.role === "business" && (
          <Section id="business-profile" title="Business profile">
            <p className="mb-6 max-w-xl">
              Creators see your business name and town on your campaigns.
            </p>
            <div className="max-w-md">
              <ProfileForm
                role={profile.role}
                action={updateProfileAction}
                initial={profile}
                submitLabel="Save changes"
                pendingLabel="Saving…"
              />
            </div>
          </Section>
        )}

        {profile?.role === "influencer" && (
          <Section id="public-profile" title="Your public profile">
            <p className="max-w-xl">
              Your photo, niches, platforms and rate: what businesses see in the
              creator directory.
            </p>
            <Link
              href="/profile"
              className={buttonVariants({
                variant: "secondary",
                className: "mt-5",
              })}
            >
              Edit your profile
            </Link>
          </Section>
        )}

        {user.role !== "admin" && (
          <Section id="blocked" title="Blocked people">
            {blocks.length === 0 ? (
              <p>
                You haven’t blocked anyone. Block someone from a conversation or
                their profile; you won’t be able to message or start new work
                with each other.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {blocks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0 truncate font-semibold text-ink">
                      {b.name}
                    </span>
                    <BlockControl
                      otherId={b.id}
                      otherName={b.name}
                      blockedByMe
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {user.role !== "admin" && (
          <Section id="standing" title="Account standing">
            <p>Strikes for sharing contact details in messages, and appeals.</p>
            <Link
              href="/account/standing"
              className={buttonVariants({
                variant: "secondary",
                className: "mt-5",
              })}
            >
              See your account standing
            </Link>
          </Section>
        )}

        <Section id="sign-out" title="Sign out">
          <p className="max-w-xl">Sign out of Pitchype on this device.</p>
          <form action={signOutAction} className="mt-5">
            <Button type="submit" variant="secondary">
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </Section>
      </div>
    </>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-card panel p-5 sm:p-6"
    >
      <h2 id={`${id}-title`} className="mb-4 text-display-md">
        {title}
      </h2>
      {children}
    </section>
  );
}
