import type { Metadata } from "next";
import Link from "next/link";

import { AuthAlternative, AuthHeading } from "@/components/shells/auth-shell";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading title="Create your account">
        Free to join. Tell us how you’ll use Pitchype.
      </AuthHeading>
      <SignUpForm />
      <AuthAlternative>
        Already have an account?{" "}
        <Link href="/login" className="link">
          Log in
        </Link>
      </AuthAlternative>
    </>
  );
}
