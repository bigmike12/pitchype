// Labelled form controls with hint and error text wired up for screen readers.
// Plain components with no state, usable from server and client components.

import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const controlClass =
  "mt-2 block h-12 w-full rounded-xl border bg-white px-4 text-base text-ink placeholder:text-muted focus-visible:border-ink";

function describedBy(name: string, hint?: ReactNode, error?: string) {
  return (
    [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

export function FieldMessages({
  name,
  hint,
  error,
}: {
  name: string;
  hint?: ReactNode;
  error?: string;
}) {
  return (
    <>
      {hint && (
        <p id={`${name}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${name}-error`}
          className="mt-1.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
    </>
  );
}

type TextFieldProps = {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
} & Omit<ComponentProps<"input">, "name" | "id">;

export function TextField({
  label,
  name,
  hint,
  error,
  className,
  ...input
}: TextFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={name} className="block font-semibold text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
        className={cn(controlClass, error ? "border-danger" : "border-field")}
        {...input}
      />
      <FieldMessages name={name} hint={hint} error={error} />
    </div>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  placeholder: string;
  hint?: ReactNode;
  error?: string;
} & Omit<ComponentProps<"select">, "name" | "id" | "children">;

export function SelectField({
  label,
  name,
  options,
  placeholder,
  hint,
  error,
  className,
  ...select
}: SelectFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={name} className="block font-semibold text-ink">
        {label}
      </label>
      <select
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, hint, error)}
        className={cn(controlClass, error ? "border-danger" : "border-field")}
        {...select}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessages name={name} hint={hint} error={error} />
    </div>
  );
}

/**
 * Form-level result. Always rendered so screen readers announce changes;
 * empty and visually hidden when there's nothing to say.
 */
export function FormStatus({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message?: string;
}) {
  const visible = Boolean(message) && status !== "idle";
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "text-sm font-medium",
        !visible && "sr-only",
        status === "error" ? "text-danger" : "text-brand-green",
      )}
    >
      {visible ? message : ""}
    </p>
  );
}

/** White card the auth and account forms sit on. */
export function FormCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-hairline sm:p-6">
      {children}
    </div>
  );
}
