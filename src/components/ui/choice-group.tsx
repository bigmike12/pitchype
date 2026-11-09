// A small set of mutually exclusive choices shown as pills (real radio
// buttons underneath, so arrow keys and forms work without JavaScript).
// Used for "business or creator" on the waitlist and at sign-up.

import { cn } from "@/lib/utils";

import { FieldMessages } from "./field";

type Option = { value: string; label: string };

export function ChoiceGroup({
  legend,
  name,
  options,
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
  /** Pass `value` + `onValueChange` to control it; otherwise `defaultValue`. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  const controlled = value !== undefined;

  return (
    <fieldset
      aria-describedby={error ? `${name}-error` : undefined}
      className={className}
    >
      <legend className="font-semibold text-ink">{legend}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "inline-flex h-12 cursor-pointer items-center justify-center rounded-full border bg-white px-4 text-center font-semibold text-ink not-has-checked:hover:bg-surface-card",
              "has-checked:border-ink has-checked:bg-ink has-checked:text-white",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink",
              error ? "border-danger" : "border-field",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              required={required}
              className="sr-only"
              {...(controlled
                ? {
                    checked: value === option.value,
                    onChange: () => onValueChange?.(option.value),
                  }
                : { defaultChecked: defaultValue === option.value })}
            />
            {option.label}
          </label>
        ))}
      </div>
      <FieldMessages id={name} error={error} />
    </fieldset>
  );
}
