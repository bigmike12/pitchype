// Small helpers shared by the form parsers. Kept free of framework imports so
// the parsers can be unit-tested with Node's test runner.

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export type Parsed<Value, Field extends string> =
  | { ok: true; value: Value }
  // `values` is what was typed (never passwords), so the form can show it again.
  | {
      ok: false;
      errors: FieldErrors<Field>;
      values: Partial<Record<Field, string>>;
    };

/** What a form's server action returns, for `useActionState`. */
export type FormState<Field extends string> = {
  status: "idle" | "error" | "success";
  /** Form-level message, shown above the submit button. */
  message?: string;
  errors?: FieldErrors<Field>;
  values?: Partial<Record<Field, string>>;
};

/** A text field's value, or "" for missing or non-text values. */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
