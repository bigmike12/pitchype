"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

// Google Tag Manager (with Google Analytics inside it) on the public pages
// only, and only after the visitor allows it. Unset in development and
// previews, so nothing loads and no banner shows there.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

const CHOICE_KEY = "pitchype-analytics";
const REOPEN_EVENT = "pitchype:cookie-choices";

type Choice = "granted" | "denied";

// The saved choice, read from localStorage. If storage is blocked (private
// mode), the choice holds in memory until the page is reloaded.
let memoryChoice: Choice | null = null;
const listeners = new Set<() => void>();

function readChoice(): Choice | null {
  try {
    const value = window.localStorage.getItem(CHOICE_KEY);
    return value === "granted" || value === "denied" ? value : memoryChoice;
  } catch {
    return memoryChoice;
  }
}

function saveChoice(choice: Choice) {
  memoryChoice = choice;
  try {
    window.localStorage.setItem(CHOICE_KEY, choice);
  } catch {
    // Blocked storage: memoryChoice carries it.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the choice.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// undefined on the server and during hydration: the banner and the script
// appear only once the browser has been asked.
const serverChoice = () => undefined;

// How many mounted public layouts have GTM running. A loaded script can't be
// unloaded, so when the last one goes (the visitor moved to login, sign-up or
// the portal, or turned analytics off) the page reloads without it. Counting
// and the timeout let React's development double-mount pass without a reload.
let gtmUsers = 0;

export function Analytics() {
  const choice = useSyncExternalStore(subscribe, readChoice, serverChoice);
  // "Cookie choices" in the footer reopens the banner after a choice.
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  const gtmOn = choice === "granted";
  useEffect(() => {
    if (!gtmOn) return;
    gtmUsers += 1;
    return () => {
      gtmUsers -= 1;
      window.setTimeout(() => {
        if (gtmUsers === 0) window.location.reload();
      }, 0);
    };
  }, [gtmOn]);

  if (!GTM_ID) return null;

  function decide(next: Choice) {
    saveChoice(next);
    setReopened(false);
  }

  const bannerOpen = choice === null || reopened;

  return (
    <>
      {gtmOn && (
        <>
          <Script id="gtm-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`}
          </Script>
          <Script
            id="gtm"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`}
          />
        </>
      )}

      {bannerOpen && (
        <section
          aria-label="Cookie choice"
          className="enter fixed inset-x-4 bottom-4 z-50 rounded-card glass p-4 shadow-pop ring-1 ring-hairline sm:left-auto sm:max-w-sm sm:p-5"
        >
          <p className="text-sm text-ink">
            May we use Google Analytics cookies to see which pages people visit?
            It helps us improve the site. They stay off unless you allow them.{" "}
            <Link href="/privacy" className="link">
              Privacy notice
            </Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => decide("denied")}
            >
              No thanks
            </Button>
            <Button size="sm" onClick={() => decide("granted")}>
              Allow
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

// The footer's "Cookie choices": opens the banner again so the visitor can
// change their mind. Turning analytics off reloads the page without GTM.
// The footer shows it only when NEXT_PUBLIC_GTM_ID is set.
export function CookieChoicesButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(REOPEN_EVENT))}
    >
      Cookie choices
    </button>
  );
}
