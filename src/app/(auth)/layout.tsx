import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthShell } from "@/components/shells/auth-shell";

// Sign-up and login are linked from the site, but there's nothing on them
// worth finding in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
