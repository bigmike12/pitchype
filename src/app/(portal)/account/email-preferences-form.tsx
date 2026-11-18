"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { EmailPreferences } from "@/lib/notification-email";

import {
  updateEmailPreferencesAction,
  type EmailPreferencesState,
} from "./actions";

const SWITCHES: { name: keyof EmailPreferences; label: string }[] = [
  { name: "applications", label: "Applications and hiring" },
  { name: "campaigns", label: "Campaign updates" },
  {
    name: "messages",
    label: "Messages (only if you haven’t read them after 15 minutes)",
  },
];

export function EmailPreferencesForm({
  initial,
}: {
  initial: EmailPreferences;
}) {
  const [state, formAction, pending] = useActionState<
    EmailPreferencesState,
    FormData
  >(updateEmailPreferencesAction, { status: "idle" });
  // React resets the form to its defaults after the action; the action hands
  // back the saved choices so the reset lands on them (as ProfileForm does).
  const values = state.values ?? initial;

  return (
    <form action={formAction} className="max-w-md space-y-3">
      {SWITCHES.map(({ name, label }) => (
        <label
          key={name}
          className="flex cursor-pointer items-start gap-3 rounded-card bg-canvas p-4 ring-1 ring-hairline"
        >
          <input
            type="checkbox"
            name={name}
            defaultChecked={values[name]}
            className="mt-1 size-5 accent-ink"
          />
          <span className="font-semibold text-ink">{label}</span>
        </label>
      ))}
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save email settings"}
      </Button>
    </form>
  );
}
