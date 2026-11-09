"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The "done" state that replaces a form (joined the waitlist, check your
 * email). Takes focus when it appears, so keyboard and screen reader users
 * aren't left on a button that no longer exists.
 */
export function Notice({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="flex gap-3 rounded-card bg-white p-5 text-body ring-1 ring-hairline sm:p-6"
    >
      <Icon
        className="mt-0.5 size-6 shrink-0 text-brand-green"
        aria-hidden="true"
      />
      <div>
        <p className="text-lg font-semibold text-ink">{title}</p>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  );
}
