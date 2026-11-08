"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { FieldMessages } from "./fields";

// A password input with a Show/Hide button: typing a password blind on a
// phone keyboard is where most sign-up mistakes come from.
export function PasswordField({
  label,
  name,
  hint,
  error,
  ...input
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
} & Omit<ComponentProps<"input">, "name" | "id" | "type">) {
  const [visible, setVisible] = useState(false);
  const describedBy =
    [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div>
      <label htmlFor={name} className="block font-semibold text-ink">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "block h-12 w-full rounded-xl border bg-white pr-14 pl-4 text-base text-ink focus-visible:border-ink",
            error ? "border-danger" : "border-field",
          )}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label="Show password"
          aria-pressed={visible}
          aria-controls={name}
          className="absolute top-0.5 right-0.5 grid size-11 place-items-center rounded-lg text-ink hover:bg-surface-card"
        >
          {visible ? (
            <EyeOff className="size-5" aria-hidden="true" />
          ) : (
            <Eye className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
      <FieldMessages name={name} hint={hint} error={error} />
    </div>
  );
}
