import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthShell } from "@/components/shells/auth-shell";

// Sign-up and login aren't linked from the site until launch; keep them out
// of search results too.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
