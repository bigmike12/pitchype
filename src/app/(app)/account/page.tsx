import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/shells/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { signOutAction, updateProfileAction } from "../actions";
import { LoadingNotice } from "../loading-notice";
import { ProfileForm } from "../profile-form";

export const metadata: Metadata = { title: "Your account" };

const ROLE_LABELS = {
  business: "Business",
  influencer: "Creator",
  admin: "Admin",
} as const;

export default function AccountPage() {
  return (
    <AppShell signOutAction={signOutAction}>
      <Suspense fallback={<LoadingNotice>Loading your account…</LoadingNotice>}>
        <Account />
      </Suspense>
    </AppShell>
  );
}

async function Account() {
  const user = await requireUser();
  const profile = await getProfile(user);
  if (!profile && user.role !== "admin") redirect("/onboarding");

  return (
    <>
      <h1 className="text-display-lg">Your account</h1>

      <dl className="mt-6 grid gap-4 rounded-card bg-surface-card p-5 sm:grid-cols-2 sm:p-6">
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

      {profile?.role === "business" && (
        <section aria-labelledby="profile-title" className="mt-12 max-w-md">
          <h2 id="profile-title" className="mb-6 text-display-md">
            Business profile
          </h2>
          <ProfileForm
            role={profile.role}
            action={updateProfileAction}
            initial={profile}
            submitLabel="Save changes"
            pendingLabel="Saving…"
          />
        </section>
      )}

      {profile?.role === "influencer" && (
        <LinkCard
          href="/profile"
          title="Your public profile"
          text="Your photo, niches, platforms and rate: what businesses see in the creator directory."
          action="Edit your profile"
        />
      )}

      {user.role === "admin" && (
        <LinkCard
          href="/admin"
          title="Admin"
          text="Verify creators’ handles and deal with reported profiles."
          action="Open admin"
        />
      )}

      <section aria-labelledby="next-title" className="mt-12">
        <h2 id="next-title" className="text-display-md">
          What happens next
        </h2>
        <p className="mt-2 max-w-xl">
          {user.role === "business" ? (
            <>
              You can already{" "}
              <Link href="/creators" className="link">
                browse creators
              </Link>
              , with their handles and rates. Posting campaigns and hiring open
              soon; we’ll email you as soon as you can.
            </>
          ) : (
            "Finding campaigns and getting hired opens soon. We’ll email you as soon as you can."
          )}
        </p>
      </section>
    </>
  );
}

function LinkCard({
  href,
  title,
  text,
  action,
}: {
  href: string;
  title: string;
  text: string;
  action: string;
}) {
  return (
    <section className="mt-12 rounded-card bg-white p-5 ring-1 ring-hairline sm:p-6">
      <h2 className="text-display-md">{title}</h2>
      <p className="mt-2 max-w-xl">{text}</p>
      <Link href={href} className={buttonVariants({ className: "mt-5" })}>
        {action}
      </Link>
    </section>
  );
}
