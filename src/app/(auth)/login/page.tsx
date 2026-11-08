import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-8 text-display-lg">Log in</h1>
      <LoginForm />
      <p className="mt-6 text-center">
        New to Pitchype?{" "}
        <Link
          href="/signup"
          className="font-semibold text-ink underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
