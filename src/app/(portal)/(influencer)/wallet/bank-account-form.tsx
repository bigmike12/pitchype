"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import {
  checkBankAccountAction,
  saveBankAccountAction,
  type BankState,
} from "./actions";

/**
 * Two steps: check the account (Paystack says whose it is), then save it once
 * the creator says it's theirs. What was typed stays in this component, so
 * the server never has to send the full number back. The server checks and
 * asks Paystack again on save.
 */
export function BankAccountForm({
  banks,
  hasAccount,
}: {
  banks: { code: string; name: string }[];
  hasAccount: boolean;
}) {
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [checkState, checkAction, checking] = useActionState<
    BankState,
    FormData
  >(checkBankAccountAction, { status: "idle" });
  const [saveState, saveAction, saving] = useActionState<BankState, FormData>(
    saveBankAccountAction,
    { status: "idle" },
  );
  const [dismissed, setDismissed] = useState<BankState | null>(null);

  // "No, change it" goes back to the first step without a round trip.
  const confirming = checkState.step === "confirm" && dismissed !== checkState;

  if (confirming) {
    return (
      <form action={saveAction} className="max-w-md space-y-4">
        <input type="hidden" name="bankCode" value={bankCode} />
        <input type="hidden" name="accountNumber" value={accountNumber} />
        <div className="rounded-card panel p-4">
          <p className="font-semibold text-ink">Is this you?</p>
          <p className="mt-1 text-ink">
            {checkState.accountName} · {checkState.bankName} · ••••
            {checkState.last4}
          </p>
        </div>
        <FormMessage status={saveState.status} message={saveState.message} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Yes, save it"}
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(checkState)}
            className="min-h-11 font-semibold text-ink underline underline-offset-4"
          >
            No, change it
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={checkAction} className="max-w-md space-y-4">
      <SelectField
        label="Bank"
        name="bankCode"
        placeholder="Choose your bank"
        required
        value={bankCode}
        onChange={(event) => setBankCode(event.target.value)}
        options={banks.map((bank) => ({ value: bank.code, label: bank.name }))}
      />
      <TextField
        label="Account number"
        name="accountNumber"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        pattern="[0-9]{10}"
        required
        value={accountNumber}
        onChange={(event) => setAccountNumber(event.target.value)}
        hint="10 digits. We’ll show you the name on the account before saving."
      />
      <FormMessage status={checkState.status} message={checkState.message} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={checking}>
          {checking ? "Checking…" : "Check account"}
        </Button>
        {hasAccount && (
          <Link href="/wallet" className={buttonVariants({ variant: "ghost" })}>
            Keep my current account
          </Link>
        )}
      </div>
    </form>
  );
}
