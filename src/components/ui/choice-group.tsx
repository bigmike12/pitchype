// A small set of mutually exclusive choices, built on real radio buttons (so
// arrow keys and forms work without JavaScript). Two looks:
// - "pills": compact, label only.
// - "cards": stacked options with an icon and a one-line description, for
//   choices that need explaining (the account type at sign-up).

import { Check, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { FieldMessages } from "./field";

type Option = {
  value: string;
  label: string;
  /** Cards only. */
  description?: string;
  /** Cards only. */
  icon?: LucideIcon;
  /** Cards only: the icon's background. */
  tone?: "mint" | "lilac" | "sun" | "peach" | "coral";
};

const TONES = {
  mint: "bg-brand-mint",
  lilac: "bg-brand-lilac",
  sun: "bg-brand-sun",
  peach: "bg-brand-peach",
  coral: "bg-brand-coral",
} as const;

export function ChoiceGroup({
  legend,
  name,
  options,
  variant = "pills",
  value,
  defaultValue,
  onValueChange,
  required,
  error,
  className,
}: {
  legend: string;
  name: string;
  options: readonly Option[];
  variant?: "pills" | "cards";
  /** Pass `value` + `onValueChange` to control it; otherwise `defaultValue`. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  const controlled = value !== undefined;

  function radio(option: Option, extra?: object) {
    return (
      <input
        type="radio"
        name={name}
        value={option.value}
        required={required}
        className="sr-only"
        {...extra}
        {...(controlled
          ? {
              checked: value === option.value,
              onChange: () => onValueChange?.(option.value),
            }
          : { defaultChecked: defaultValue === option.value })}
      />
    );
  }

  const focusRing =
    "has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink";
  const border = error ? "border-danger" : "border-field";

  return (
    <fieldset
      aria-describedby={error ? `${name}-error` : undefined}
      className={className}
    >
      <legend className="font-semibold text-ink">{legend}</legend>

      {variant === "pills" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "inline-flex h-12 cursor-pointer items-center justify-center rounded-full border bg-surface px-4 text-center font-semibold text-ink shadow-card not-has-checked:hover:bg-surface-soft motion-safe:transition-colors",
                "has-checked:border-ink has-checked:bg-ink has-checked:text-white has-checked:shadow-button",
                focusRing,
                border,
              )}
            >
              {radio(option)}
              {option.label}
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {options.map((option) => {
            const titleId = `${name}-${option.value}-title`;
            const descriptionId = `${name}-${option.value}-description`;
            const Icon = option.icon;
            return (
              <label
                key={option.value}
                className={cn(
                  "group flex cursor-pointer items-start gap-4 rounded-card border bg-surface p-4 text-ink shadow-card not-has-checked:hover:shadow-lift motion-safe:transition-shadow",
                  // A 2px ink edge and a violet wash when chosen, without shifting the layout.
                  "has-checked:border-ink has-checked:bg-[linear-gradient(135deg,rgb(221_210_255/0.35),rgb(255_255_255)_60%)] has-checked:ring-1 has-checked:ring-ink",
                  focusRing,
                  border,
                )}
              >
                {radio(option, {
                  "aria-labelledby": titleId,
                  "aria-describedby": option.description
                    ? descriptionId
                    : undefined,
                })}
                {Icon && (
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-full text-ink",
                      TONES[option.tone ?? "mint"],
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span id={titleId} className="block font-semibold">
                    {option.label}
                  </span>
                  {option.description && (
                    <span
                      id={descriptionId}
                      className="mt-0.5 block text-sm text-muted"
                    >
                      {option.description}
                    </span>
                  )}
                </span>
                {/* Radio indicator: empty ring, or a filled check when chosen. */}
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 border-field text-white group-has-checked:border-ink group-has-checked:bg-ink"
                >
                  <Check className="size-3.5 opacity-0 group-has-checked:opacity-100" />
                </span>
              </label>
            );
          })}
        </div>
      )}

      <FieldMessages id={name} error={error} />
    </fieldset>
  );
}
