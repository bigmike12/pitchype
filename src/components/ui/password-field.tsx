"use client";

import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";

import {
  FieldIcon,
  FieldLabel,
  FieldMessages,
  controlClasses,
  describedBy,
} from "./field";

// A password field with a Show button: typing a password blind on a phone
// keyboard is where most sign-up mistakes come from.
export function PasswordField({
  label,
  name,
  id = name,
  hint,
  error,
  icon,
  labelAside,
  ...input
}: {
  label: string;
  name: string;
  id?: string;
  hint?: string;
  error?: string;
  icon?: LucideIcon;
  labelAside?: ReactNode;
} & Omit<ComponentProps<"input">, "name" | "id" | "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <FieldLabel htmlFor={id} aside={labelAside}>
        {label}
      </FieldLabel>
      <div className="relative mt-2">
        {icon && <FieldIcon icon={icon} />}
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={controlClasses({
            error,
            icon: Boolean(icon),
            trailing: true,
          })}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label="Show password"
          aria-pressed={visible}
          aria-controls={id}
          className="absolute top-0.5 right-0.5 grid size-11 place-items-center rounded-control text-ink hover:bg-surface-card"
        >
          {visible ? (
            <EyeOff className="size-5" aria-hidden="true" />
          ) : (
            <Eye className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}
