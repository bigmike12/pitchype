"use client";

import { CircleCheck, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";

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

  if (state?.ok) {
    return <Notice icon={CircleCheck} title={state.message} />;
  }

  return (
    <form
      action={formAction}
      className="relative space-y-5 rounded-card bg-white p-5 ring-1 ring-hairline sm:p-6"
    >
      <TextField
        label="Email address"
        name="email"
        id="waitlist-email"
        type="email"
        icon={Mail}
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        placeholder="you@example.com"
        defaultValue={failed ? state.email : undefined}
        // Errors here are form-level (shown in the status line below).
        aria-invalid={failed || undefined}
        aria-describedby="waitlist-status waitlist-privacy"
      />

      <ChoiceGroup
        legend="I’m joining as"
        name="role"
        options={ROLE_OPTIONS}
        value={role}
        onValueChange={setRole}
        required
        className="max-w-sm"
      />

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

      <FormMessage
        id="waitlist-status"
        status={failed ? "error" : "idle"}
        message={failed ? state.message : undefined}
      />

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Joining…" : "Join the waitlist"}
      </Button>

      <p id="waitlist-privacy" className="text-sm text-muted">
        We’ll only use your email to tell you when Pitchype opens. You can ask
        us to remove it at any time. Read the{" "}
        <Link href="/privacy" className="link">
          privacy notice
        </Link>
        .
      </p>
    </form>
  );
}
