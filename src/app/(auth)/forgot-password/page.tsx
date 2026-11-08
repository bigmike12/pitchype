import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-display-lg">Reset your password</h1>
      <p className="mt-3 mb-8 text-lg">
        Enter the email you signed up with and we’ll send you a link to choose a
        new password.
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-semibold text-ink underline underline-offset-4"
        >
          Log in
        </Link>
      </p>
    </>
  );
}
