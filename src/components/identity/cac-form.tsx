"use client";

import { Building2, Hash, Store } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { COMPANY_TYPE_OPTIONS } from "@/lib/company-types";

import { verifyCacAction, type CacState } from "./actions";

/** A registered business: name, kind of registration and RC/BN number, checked against CAC. */
export function CacForm({ next }: { next: "onboarding" | "account" }) {
  const [state, formAction, pending] = useActionState<CacState, FormData>(
    verifyCacAction,
    { status: "idle" },
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Registered business name"
        name="name"
        icon={Store}
        autoComplete="organization"
        required
        maxLength={200}
        defaultValue={values.name}
        error={errors.name}
        hint="The name on your CAC certificate."
      />
      <SelectField
        label="Kind of registration"
        name="companyType"
        icon={Building2}
        options={COMPANY_TYPE_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        placeholder="Choose one"
        required
        defaultValue={values.companyType}
        error={errors.companyType}
      />
      <TextField
        label="RC or BN number"
        name="rcNumber"
        icon={Hash}
        inputMode="numeric"
        autoComplete="off"
        required
        maxLength={20}
        defaultValue={values.rcNumber}
        error={errors.rcNumber}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="w-full sm:w-auto"
      >
        {pending ? "Checking…" : "Check with CAC"}
      </Button>
    </form>
  );
}
