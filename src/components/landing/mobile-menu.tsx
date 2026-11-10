"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";

export type NavLink = { href: string; label: string };

// Disclosure menu for phones. It needs JavaScript to close itself when a link
// is tapped; without JS the sections are still one scroll away and the header
// keeps its "Join" button.
export function MobileMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((isOpen) => !isOpen)}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        {open ? (
          <X aria-hidden="true" className="size-6" />
        ) : (
          <Menu aria-hidden="true" className="size-6" />
        )}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full mt-2 rounded-2xl px-4 pt-2 pb-4 shadow-pop ring-1 ring-ink/[0.07] glass motion-safe:animate-[fade-up_0.4s_var(--ease-out-expo)]"
      >
        <nav aria-label="Main">
          <ul>
            {links.map((link) => (
              <li
                key={link.href}
                className="border-b border-hairline last:border-b-0"
              >
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-lg text-lg font-medium text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {/* The header hides Log in on phones; it lives here instead. */}
            <li className="sm:hidden">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-lg text-lg font-medium text-ink"
              >
                Log in
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
