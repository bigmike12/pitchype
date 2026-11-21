"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * A business's Pitchype bank-transfer account: the bank, the number with a
 * button that copies it, and the account name exactly as the bank shows it
 * (it may carry a prefix, so it is never rewritten).
 */
export function TransferAccount({
  bankName,
  accountNumber,
  accountName,
}: {
  bankName: string;
  accountNumber: string;
  accountName: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <dl className="space-y-3 rounded-card panel p-5 sm:p-6">
      <div className="flex justify-between gap-4">
        <dt>Bank</dt>
        <dd className="text-right font-semibold text-ink">{bankName}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt>Account number</dt>
        <dd className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-wide text-ink tabular-nums">
            {accountNumber}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(accountNumber);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // Clipboard refused: the number is on screen to copy by hand.
              }
            }}
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt>Account name</dt>
        <dd className="text-right font-semibold text-ink">{accountName}</dd>
      </div>
    </dl>
  );
}
