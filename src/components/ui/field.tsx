// Form fields, part of the design system: one look for every text-like
// control on the site (waitlist, auth, profiles). Labels are always visible;
// hints and errors are wired to the control for screen readers.

import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const controlClass =
  "block h-12 w-full rounded-control border bg-white text-base text-ink placeholder:text-muted focus-visible:border-ink";

export function controlClasses({
  error,
  icon,
  trailing,
}: {
  error?: string;
  icon?: boolean;
  trailing?: boolean;
}) {
  return cn(
    controlClass,
    error ? "border-danger" : "border-field",
    icon ? "pl-11" : "pl-4",
    trailing ? "pr-14" : "pr-4",
  );
}

export function describedBy(id: string, hint?: ReactNode, error?: string) {
  return (
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

/** Label row; `aside` sits at the right end (e.g. "Forgot your password?"). */
export function FieldLabel({
  htmlFor,
  children,
  aside,
}: {
  htmlFor: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="font-semibold text-ink">
        {children}
      </label>
      {aside && <span className="text-sm">{aside}</span>}
    </div>
  );
}

export function FieldIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-muted"
    />
  );
}

export function FieldMessages({
  id,
  hint,
  error,
}: {
  id: string;
  hint?: ReactNode;
  error?: string;
}) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="mt-1.5 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
    </>
  );
}

type FieldProps = {
  label: string;
  name: string;
  /** Defaults to `name`; set it when a page has two fields with one name. */
  id?: string;
  hint?: ReactNode;
  error?: string;
  icon?: LucideIcon;
  labelAside?: ReactNode;
};

export function TextField({
  label,
  name,
  id = name,
  hint,
  error,
  icon,
  labelAside,
  className,
  ...input
}: FieldProps & Omit<ComponentProps<"input">, "name" | "id">) {
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} aside={labelAside}>
        {label}
      </FieldLabel>
      <div className="relative mt-2">
        {icon && <FieldIcon icon={icon} />}
        <input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={controlClasses({ error, icon: Boolean(icon) })}
          {...input}
        />
      </div>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  id = name,
  options,
  placeholder,
  hint,
  error,
  icon,
  className,
  ...select
}: FieldProps & {
  options: { value: string; label: string }[];
  placeholder: string;
} & Omit<ComponentProps<"select">, "name" | "id" | "children">) {
  return (
    <div className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative mt-2">
        {icon && <FieldIcon icon={icon} />}
        <select
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          // Our own chevron, so selects line up with text fields.
          className={cn(
            controlClasses({ error, icon: Boolean(icon), trailing: true }),
            "appearance-none",
          )}
          {...select}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-ink"
        />
      </div>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}
