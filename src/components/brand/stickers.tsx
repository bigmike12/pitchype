// Brand kit: the stickers and "clay" shapes used in the illustrations (landing
// hero, auth panel). Position them with `className`; they carry their own tilt.

import { Check, Lock, type LucideIcon } from "lucide-react";

import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Soft "clay" shading: a light spot and a gentle fall-off from the top-left,
 * over the colour. For tiles and the odd decorative shape.
 */
export function clay(colour: string) {
  return `radial-gradient(circle at 30% 22%, rgb(255 255 255 / 0.85), transparent 46%), linear-gradient(160deg, color-mix(in oklab, ${colour} 70%, white) 0%, ${colour} 55%, color-mix(in oklab, ${colour} 88%, #0e0e10) 100%)`;
}

export type Tone =
  "sun" | "lilac" | "mint" | "peach" | "coral" | "sky" | "rose";

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
        "grid shrink-0 place-items-center text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.8),inset_0_-2px_4px_rgb(14_14_16/0.08),0_6px_14px_-6px_rgb(14_14_16/0.25)] ring-1 ring-ink/5",
        size === "lg"
          ? "size-12 rounded-[0.875rem]"
          : "size-9 rounded-[0.625rem]",
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
        "flex items-center gap-2.5 rounded-card px-3.5 py-3 whitespace-nowrap shadow-pop [--tilt:-4deg] motion-safe:animate-float",
        tone === "green"
          ? "bg-brand-green on-dark ring-1 ring-white/10"
          : "bg-surface text-ink ring-1 ring-hairline",
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
        "flex items-center gap-1.5 rounded-full bg-brand-sun px-3 py-2 text-sm font-semibold whitespace-nowrap text-ink shadow-lift ring-1 ring-ink/5",
        className,
      )}
      style={{ transform: "rotate(5deg)" }}
    >
      <Check className="size-4" aria-hidden="true" />
      Work approved
    </div>
  );
}
