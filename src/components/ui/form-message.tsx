import { cn } from "@/lib/utils";

/**
 * A form's overall result, shown just above its submit button. Always
 * rendered so screen readers announce changes; visually hidden when empty.
 */
export function FormMessage({
  id,
  status,
  message,
}: {
  id?: string;
  status: "idle" | "error" | "success";
  message?: string;
}) {
  const visible = Boolean(message) && status !== "idle";
  return (
    <p
      id={id}
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
