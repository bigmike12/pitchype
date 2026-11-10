"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Audience = "business" | "creator";

const TABS: { id: Audience; label: string }[] = [
  { id: "business", label: "Business" },
  { id: "creator", label: "Creator" },
];

// The only interactive part of "How it works". Both step lists are rendered on
// the server and passed in; this just switches which one is shown, following
// the WAI-ARIA tabs pattern (arrow keys, Home and End move between tabs).
export function HowItWorksTabs({
  business,
  creator,
}: {
  business: ReactNode;
  creator: ReactNode;
}) {
  const [active, setActive] = useState<Audience>("business");
  const tabRefs = useRef<Partial<Record<Audience, HTMLButtonElement | null>>>(
    {},
  );
  const panels: Record<Audience, ReactNode> = { business, creator };

  function select(id: Audience) {
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.id === active);
    const last = TABS.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(TABS[next].id);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Show the steps for"
        onKeyDown={onKeyDown}
        className="inline-flex rounded-full bg-surface-card p-1 shadow-[inset_0_1px_2px_rgb(14_14_16/0.06)]"
      >
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              id={`how-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`how-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                "h-11 min-w-28 rounded-full px-6 text-[0.9375rem] font-semibold motion-safe:transition-[background-color,box-shadow,color]",
                selected
                  ? "bg-surface text-ink shadow-card ring-1 ring-hairline"
                  : "text-body hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.id}
          id={`how-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`how-tab-${tab.id}`}
          tabIndex={0}
          hidden={tab.id !== active}
          className="mt-8 rounded-panel motion-safe:animate-[fade-up_0.6s_var(--ease-out-expo)]"
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
