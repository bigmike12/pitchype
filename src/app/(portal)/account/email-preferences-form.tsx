"use client";

import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { FormState } from "@/lib/form-data";
import type { EmailPreferences } from "@/lib/notification-email";

import { updateEmailPreferencesAction } from "./actions";

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
    FormState<never>,
    FormData
  >(updateEmailPreferencesAction, { status: "idle" });
  const [checked, setChecked] = useState(initial);

  // Not `<form action>`: React resets a form to its defaults after an action
  // runs, which would put a saved change back on screen as it was.
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  return (
    <form onSubmit={save} className="max-w-md space-y-3">
      {SWITCHES.map(({ name, label }) => (
        <label
          key={name}
          className="flex cursor-pointer items-start gap-3 rounded-card bg-canvas p-4 ring-1 ring-hairline"
        >
          <input
            type="checkbox"
            name={name}
            checked={checked[name]}
            onChange={(event) =>
              setChecked({ ...checked, [name]: event.target.checked })
            }
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
