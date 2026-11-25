import Link from "next/link";

import { Button } from "@/components/ui/button";
import { IDENTITY_FIRST } from "@/lib/identity-gate";

/**
 * Stands in for a button the person cannot use until their identity is
 * confirmed: the same button, disabled, with the reason and a link beside it
 * (CLAUDE.md §5: show why, don't hide).
 */
export function IdentityRequired({
  label,
  size,
}: {
  label: string;
  size?: "sm" | "lg";
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="button" size={size} disabled>
        {label}
      </Button>
      <Link href="/account#identity" className="link text-sm">
        {IDENTITY_FIRST}
      </Link>
    </span>
  );
}
