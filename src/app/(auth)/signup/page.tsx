import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-display-lg">Create your account</h1>
      <p className="mt-3 mb-8 text-lg">
        One account per email, as a business or as a creator.
      </p>
      <SignUpForm />
      <p className="mt-6 text-center">
        Already have an account?{" "}
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
