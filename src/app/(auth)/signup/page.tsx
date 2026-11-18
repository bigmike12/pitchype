import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthAlternative, AuthHeading } from "@/components/shells/auth-shell";
import { signupRoleFromParam } from "@/lib/credentials";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  return (
    <>
      <AuthHeading title="Create your account">Free to join.</AuthHeading>
      {/* The form paints at once; a valid ?role= from the landing or audience
          pages then fixes the account type and hides the picker. */}
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
  return <SignUpForm initialRole={signupRoleFromParam(role)} />;
}
