"use client";

import { useState } from "react";

import { ChoiceGroup } from "@/components/ui/choice-group";

import { CacForm } from "./cac-form";
import { PersonCheckForm } from "./person-check-form";

/** Registered with CAC, or not: a registered business is checked at CAC, anyone else by their owner's BVN. */
export function BusinessIdentity({ next }: { next: "onboarding" | "account" }) {
  const [kind, setKind] = useState<"registered" | "unregistered" | "">("");
  return (
    <div className="space-y-6">
      <ChoiceGroup
        legend="Is your business registered with CAC?"
        name="registered"
        options={[
          { value: "registered", label: "Registered" },
          { value: "unregistered", label: "Not registered" },
        ]}
        value={kind}
        onValueChange={(value) =>
          setKind(value === "registered" ? "registered" : "unregistered")
        }
      />
      {kind === "registered" ? <CacForm next={next} /> : null}
      {kind === "unregistered" ? (
        <PersonCheckForm kind="owner_bvn" idLabel="BVN" />
      ) : null}
    </div>
  );
}
