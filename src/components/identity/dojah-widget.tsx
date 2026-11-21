"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

// Dojah's hosted flow (NIN or BVN plus a live selfie), embedded on the page.
// The script is Dojah's own and is loaded only here. The browser's "success"
// only means the person finished: the decision arrives by Dojah's signed
// webhook, so this component just says "checking" and refreshes the page until
// the server shows the result (design §5.2). Nothing is logged: not the
// answer Dojah hands back, and not the names.

type Connect = { setup: () => void; open: () => void };

declare global {
  interface Window {
    Connect?: new (options: Record<string, unknown>) => Connect;
  }
}

const SCRIPT_URL = "https://widget.dojah.io/widget.js";
const REFRESH_EVERY_MS = 4_000;
const REFRESH_LIMIT = 45;
const LOAD_FAILED = "Couldn’t load the check. Please try again.";

export function DojahWidget({
  appId,
  publicKey,
  widgetId,
  reference,
  firstName,
  lastName,
  onClose,
}: {
  appId: string;
  publicKey: string;
  widgetId: string;
  reference: string;
  firstName: string;
  lastName: string;
  /** The person closed the widget without finishing; the check stays open to resume. */
  onClose: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<
    "loading" | "open" | "checking" | "failed"
  >("loading");
  const opened = useRef(false);
  const finished = useRef(false);
  const refreshes = useRef(0);

  // While the server decides, look again every few seconds for a while.
  useEffect(() => {
    if (phase !== "checking") return;
    const timer = setInterval(() => {
      refreshes.current += 1;
      router.refresh();
      if (refreshes.current >= REFRESH_LIMIT) clearInterval(timer);
    }, REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, [phase, router]);

  function open() {
    if (opened.current) return;
    if (!window.Connect) {
      console.error("identity: the Dojah widget script loaded without Connect");
      setPhase("failed");
      return;
    }
    opened.current = true;
    const connect = new window.Connect({
      app_id: appId,
      p_key: publicKey,
      type: "custom",
      embed: true,
      container: "#dojah-widget",
      config: { widget_id: widgetId },
      reference_id: reference,
      user_data: { first_name: firstName, last_name: lastName },
      metadata: { reference },
      onSuccess: () => {
        finished.current = true;
        setPhase("checking");
      },
      onError: () => setPhase("failed"),
      onClose: () => {
        // A close after finishing is not a cancel.
        if (!finished.current) onClose();
      },
    });
    connect.setup();
    connect.open();
    setPhase("open");
  }

  return (
    <div>
      {/* next/script: no async or defer on Dojah's script, as its docs ask. onReady also runs when the script is already there. */}
      <Script
        src={SCRIPT_URL}
        strategy="afterInteractive"
        onReady={open}
        onError={() => {
          console.error("identity: the Dojah widget script failed to load");
          setPhase("failed");
        }}
      />

      {phase === "failed" ? (
        <div role="alert" className="space-y-4">
          <p className="font-semibold text-danger">{LOAD_FAILED}</p>
          <Button type="button" variant="secondary" onClick={onClose}>
            Back
          </Button>
        </div>
      ) : null}

      {phase === "checking" ? (
        <div role="status" className="flex items-start gap-3">
          <Loader2
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted motion-safe:animate-spin"
          />
          <div>
            <p className="font-semibold text-ink">Checking…</p>
            <p className="mt-1">
              This usually takes under a minute. You can leave this page; we’ll
              tell you when it’s done.
            </p>
          </div>
        </div>
      ) : null}

      {phase === "loading" ? (
        <p role="status" className="text-muted">
          Opening the check…
        </p>
      ) : null}

      <div
        id="dojah-widget"
        className={phase === "open" ? "mt-2 min-h-[32rem]" : "hidden"}
      />
    </div>
  );
}
