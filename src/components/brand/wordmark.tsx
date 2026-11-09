import { cn } from "@/lib/utils";

// Also used by the generated social and app icons, which need a pixel size
// instead of a class. The same drawing lives in src/app/icon.svg; keep the two in step.
export function PitchypeMark({
  className,
  size,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
    >
      <path
        d="M9 3h14a7 7 0 0 1 7 7v7a7 7 0 0 1-7 7h-8.5l-6.2 4.7a.8.8 0 0 1-1.3-.6V23.6A7 7 0 0 1 2 17v-7a7 7 0 0 1 7-7Z"
        fill="#ff6b57"
      />
      <circle cx="11.5" cy="11.5" r="1.9" fill="#121212" />
      <circle cx="20.5" cy="11.5" r="1.9" fill="#121212" />
      <path
        d="M10.8 16c2.8 2.6 7.6 2.6 10.4 0"
        fill="none"
        stroke="#121212"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-[1.4rem] leading-none font-semibold tracking-[-0.035em] text-ink",
        className,
      )}
    >
      <PitchypeMark className="size-7" />
      pitchype
    </span>
  );
}
