import type { Metadata } from "next";
import Link from "next/link";

import { AuthAlternative, AuthHeading } from "@/components/shells/auth-shell";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Reset your password">
        Enter the email you signed up with and we’ll send you a link to choose a
        new one.
      </AuthHeading>
      <ForgotPasswordForm />
      <AuthAlternative>
        Remembered it?{" "}
        <Link href="/login" className="link">
          Log in
        </Link>
      </AuthAlternative>
    </>
  );
}
