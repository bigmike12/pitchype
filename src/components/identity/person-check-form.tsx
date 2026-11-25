"use client";

import { UserRound } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import { startPersonCheckAction, type PersonCheckStart } from "./actions";
import { DojahWidget } from "./dojah-widget";

/**
 * Asks for the legal name, then opens Dojah's widget for a NIN and a
 * live selfie. The name is compared with the government record by the server
 * when Dojah reports back.
 */
export function PersonCheckForm({
  kind,
}: {
  kind: "creator_nin" | "owner_nin" | "director_nin";
}) {
  const [start, setStart] = useState<PersonCheckStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (start?.status === "ready") {
    return (
      <DojahWidget
        {...start.widget}
        reference={start.reference}
        firstName={start.prefill.firstName}
        lastName={start.prefill.lastName}
        onClose={() => setStart(null)}
      />
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await startPersonCheckAction(kind, form);
          if (result.status === "error") setError(result.message);
          else setStart(result);
        });
      }}
      className="space-y-5"
    >
      <TextField
        label="Your full legal name"
        name="legalName"
        icon={UserRound}
        autoComplete="name"
        required
        minLength={3}
        maxLength={200}
        hint="Exactly as it appears on your NIN record. Your legal name stays private."
      />
      <FormMessage status={error ? "error" : "idle"} message={error ?? ""} />
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="w-full sm:w-auto"
      >
        {pending ? "Starting…" : "Start the check"}
      </Button>
    </form>
  );
}
