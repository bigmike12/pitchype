// Brand kit: the stickers and "clay" shapes used in the illustrations (landing
// hero, auth panel). Position them with `className`; they carry their own tilt.

import { Check, Lock, type LucideIcon } from "lucide-react";

import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Soft "clay" shading for background shapes: a light spot over a flat fill. */
export function clay(colour: string) {
  return `radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.55), transparent 42%), ${colour}`;
}

export type Tone = "sun" | "lilac" | "mint" | "peach" | "coral";

/**
 * A rounded square in a brand colour with clay shading and an ink icon: our
 * stand-in for 3D icons, on onboarding steps, action cards and empty states.
 * Decorative; the words beside it carry the meaning.
 */
export function ClayTile({
  icon: Icon,
  tone,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone: Tone;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center text-ink",
        size === "lg" ? "size-11 rounded-xl" : "size-9 rounded-[0.625rem]",
        className,
      )}
      style={{ background: clay(`var(--color-brand-${tone})`) }}
    >
      <Icon className={size === "lg" ? "size-5" : "size-[1.125rem]"} />
    </span>
  );
}

/**
 * "₦X held in escrow", the signature sticker. `tone="light"` is for dark
 * backgrounds such as the green auth panel.
 */
export function EscrowSticker({
  amountKobo,
  tone = "green",
  className,
}: {
  amountKobo: number;
  tone?: "green" | "light";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-card px-3.5 py-3 whitespace-nowrap [--tilt:-4deg] motion-safe:animate-float",
        tone === "green" ? "bg-brand-green on-dark" : "bg-canvas text-ink",
        className,
      )}
      style={{ transform: "rotate(-4deg)" }}
    >
      <span className="grid size-9 place-items-center rounded-full bg-brand-mint text-ink">
        <Lock className="size-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-lg leading-none font-bold">
          {formatNaira(amountKobo)}
        </span>
        <span
          className={cn(
            "mt-1 block text-xs",
            tone === "green" ? "text-brand-mint" : "text-brand-green",
          )}
        >
          held in escrow
        </span>
      </span>
    </div>
  );
}

export function ApprovedBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-brand-sun px-3 py-2 text-sm font-semibold whitespace-nowrap text-ink",
        className,
      )}
      style={{ transform: "rotate(5deg)" }}
    >
      <Check className="size-4" aria-hidden="true" />
      Work approved
    </div>
  );
}
