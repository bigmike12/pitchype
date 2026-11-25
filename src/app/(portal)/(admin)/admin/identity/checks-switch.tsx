"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

import { setChecksRequiredAction, type ChecksSwitchState } from "./actions";

/**
 * The platform-wide identity switch: what it is now, and a confirmed button
 * to flip it. The server checks the role, the box and (to turn it on) that
 * Dojah is set up.
 */
export function ChecksSwitch({ required }: { required: boolean }) {
  const [state, formAction, pending] = useActionState<
    ChecksSwitchState,
    FormData
  >(setChecksRequiredAction, { status: "idle" });
  return (
    <form action={formAction} className="max-w-xl space-y-3">
      <input type="hidden" name="required" value={required ? "off" : "on"} />
      <label className="flex cursor-pointer items-start gap-3 rounded-card panel p-3">
        <input
          type="checkbox"
          name="confirm"
          required
          className="mt-1 size-5 accent-ink"
        />
        <span className="text-ink">
          {required
            ? "I understand everyone can apply, hire, list campaigns and request payouts without verifying, and nobody is screened."
            : "I understand everyone who hasn’t verified must do so before they next apply, hire, list a campaign or request a payout. Nothing already agreed changes."}
        </span>
      </label>
      <FormMessage status={state.status} message={state.message} />
      <Button
        type="submit"
        variant={required ? "secondary" : "default"}
        disabled={pending}
      >
        {required ? "Switch identity checks off" : "Switch identity checks on"}
      </Button>
    </form>
  );
}
