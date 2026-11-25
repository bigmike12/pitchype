import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthHeading, AuthShell } from "@/components/shells/auth-shell";
import { PageLoading, Skeleton } from "@/components/ui/skeleton";

import { confirmEmailLinkAction } from "./actions";
import { ConfirmButton } from "./confirm-button";

export const metadata: Metadata = {
  title: "Confirm your link",
  robots: { index: false, follow: false },
};

// Emailed links land here (supabase/templates/*.html): a sign-up
// confirmation (type=email) or a password reset (type=recovery). Opening the
// page uses nothing up; the link is spent only when the person presses the
// button. Email scanners and link previews open links before people click
// them, and if opening the address spent the link, the person's own click
// would find it already used and see "expired".
export default function ConfirmLinkPage({
  searchParams,
}: PageProps<"/auth/confirm">) {
  return (
    <AuthShell>
      {/* The query is read at request time, inside Suspense, so the shell
          can be prerendered (cacheComponents). */}
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <Skeleton className="h-10 w-3/4 rounded-xl" />
            <Skeleton className="mt-4 mb-8 h-5 w-full" />
            <Skeleton className="h-12 w-full rounded-control" />
          </PageLoading>
        }
      >
        <ConfirmLinkForm searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function ConfirmLinkForm({
  searchParams,
}: {
  searchParams: PageProps<"/auth/confirm">["searchParams"];
}) {
  const query = await searchParams;
  const tokenHash = query.token_hash;
  const type = query.type;
  if (
    typeof tokenHash !== "string" ||
    tokenHash === "" ||
    (type !== "email" && type !== "recovery")
  ) {
    redirect("/link-expired");
  }

  const isReset = type === "recovery";
  return (
    <>
      <AuthHeading
        title={isReset ? "Choose a new password" : "Confirm your email"}
      >
        {isReset
          ? "Continue to choose a new password for your account."
          : "One more step: confirm your address to finish setting up your account."}
      </AuthHeading>
      <form action={confirmEmailLinkAction}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <ConfirmButton>
          {isReset ? "Continue" : "Confirm my email"}
        </ConfirmButton>
      </form>
    </>
  );
}
