import type { Metadata } from "next";

import { AuthHeading } from "@/components/shells/auth-shell";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading title="Choose a new password">
        You’ll use it the next time you log in.
      </AuthHeading>
      <ResetPasswordForm />
    </>
  );
}
