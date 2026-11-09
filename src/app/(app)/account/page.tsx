import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/shells/app-shell";
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

      {profile && (
        <section aria-labelledby="profile-title" className="mt-12 max-w-md">
          <h2 id="profile-title" className="mb-6 text-display-md">
            {profile.role === "business"
              ? "Business profile"
              : "Creator profile"}
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

      <section aria-labelledby="next-title" className="mt-12">
        <h2 id="next-title" className="text-display-md">
          What happens next
        </h2>
        <p className="mt-2 max-w-xl">
          {user.role === "business"
            ? "Posting campaigns and hiring creators opens soon. We’ll email you as soon as you can."
            : "Finding campaigns and getting hired opens soon. We’ll email you as soon as you can."}
        </p>
      </section>
    </>
  );
}
