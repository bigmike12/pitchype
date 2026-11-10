import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthAlternative, AuthHeading } from "@/components/shells/auth-shell";
import { isSignupRole } from "@/lib/credentials";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  return (
    <>
      <AuthHeading title="Create your account">
        Free to join. Tell us how you’ll use Pitchype.
      </AuthHeading>
      {/* The form paints at once; the landing page's ?role= link then
          preselects the account type. */}
      <Suspense fallback={<SignUpForm />}>
        <FormWithRole searchParams={searchParams} />
      </Suspense>
      <AuthAlternative>
        Already have an account?{" "}
        <Link href="/login" className="link">
          Log in
        </Link>
      </AuthAlternative>
    </>
  );
}

async function FormWithRole({
  searchParams,
}: {
  searchParams: PageProps<"/signup">["searchParams"];
}) {
  const { role } = await searchParams;
  const initialRole =
    typeof role === "string" && isSignupRole(role) ? role : undefined;
  return <SignUpForm initialRole={initialRole} />;
}
