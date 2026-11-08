"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { joinWaitlist } from "./waitlist-action";
import {
  HONEYPOT_FIELD,
  isWaitlistRole,
  type WaitlistResult,
} from "./waitlist-input";

const ROLE_OPTIONS = [
  { value: "business", label: "Business" },
  { value: "creator", label: "Creator" },
] as const;

export function WaitlistForm() {
  const [state, formAction, pending] = useActionState<
    WaitlistResult | null,
    FormData
  >(joinWaitlist, null);
  // Controlled so the page's "I'm a business / creator" links can preselect it.
  const [role, setRole] = useState(
    state && !state.ok ? (state.role ?? "") : "",
  );
  const successRef = useRef<HTMLDivElement>(null);
  const failed = state?.ok === false;

  // CTAs elsewhere on the page are plain links to #waitlist with a
  // data-waitlist-role attribute (so they work without JavaScript). With
  // JavaScript, a click on one also picks that role here.
  useEffect(() => {
    function pickRoleFromLink(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest(
        "[data-waitlist-role]",
      );
      const chosen = link?.getAttribute("data-waitlist-role") ?? "";
      if (isWaitlistRole(chosen)) setRole(chosen);
    }
    document.addEventListener("click", pickRoleFromLink);
    return () => document.removeEventListener("click", pickRoleFromLink);
  }, []);

  // The form disappears on success; move focus to the message so keyboard and
  // screen reader users aren't left on nothing.
  useEffect(() => {
    if (state?.ok) successRef.current?.focus();
  }, [state]);

  if (state?.ok) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="flex gap-3 rounded-2xl bg-white p-6 text-ink ring-1 ring-hairline"
      >
        <CircleCheck
          className="mt-0.5 size-6 shrink-0 text-brand-green"
          aria-hidden="true"
        />
        <p className="text-lg font-semibold">{state.message}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="relative rounded-2xl bg-white p-5 ring-1 ring-hairline sm:p-6"
    >
      <label htmlFor="waitlist-email" className="block font-semibold text-ink">
        Email address
      </label>
      <input
        id="waitlist-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        placeholder="you@example.com"
        defaultValue={failed ? state.email : undefined}
        aria-invalid={failed || undefined}
        aria-describedby="waitlist-status waitlist-privacy"
        className="mt-2 block h-12 w-full rounded-xl border border-field bg-white px-4 text-base text-ink placeholder:text-muted focus-visible:border-ink"
      />

      <fieldset className="mt-5">
        <legend className="font-semibold text-ink">I’m joining as</legend>
        <div className="mt-2 grid max-w-80 grid-cols-2 gap-2">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center justify-center rounded-full border px-4 font-semibold",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink",
                role === option.value
                  ? "border-ink bg-ink text-white"
                  : "border-field bg-white text-ink hover:bg-surface-card",
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                required
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px overflow-hidden"
      >
        <label htmlFor="waitlist-website">Leave this field empty</label>
        <input
          id="waitlist-website"
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="mt-6 w-full"
      >
        {pending ? "Joining…" : "Join the waitlist"}
      </Button>

      <p
        id="waitlist-status"
        aria-live="polite"
        className={cn(
          "mt-3 text-sm font-medium text-danger",
          !failed && "sr-only",
        )}
      >
        {failed ? state.message : ""}
      </p>

      <p id="waitlist-privacy" className="mt-3 text-sm text-muted">
        We’ll only use your email to tell you when Pitchype opens. You can ask
        us to remove it at any time. Read the{" "}
        <Link
          href="/privacy"
          className="font-medium text-ink underline underline-offset-4"
        >
          privacy notice
        </Link>
        .
      </p>
    </form>
  );
}
