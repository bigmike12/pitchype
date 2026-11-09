import type { Metadata } from "next";
import Link from "next/link";

import { AuthAlternative, AuthHeading } from "@/components/shells/auth-shell";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <AuthHeading title="Welcome back">
        Log in to your Pitchype account.
      </AuthHeading>
      <LoginForm />
      <AuthAlternative>
        New to Pitchype?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </AuthAlternative>
    </>
  );
}
