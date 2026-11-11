"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";

import { blockAction, unblockAction } from "./block-actions";

/**
 * Block (after a confirmation saying what changes) or unblock someone. Used
 * in a thread, on an application and on a creator's profile.
 */
export function BlockControl({
  otherId,
  otherName,
  blockedByMe,
}: {
  otherId: string;
  otherName: string;
  blockedByMe: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (blockedByMe) {
    return (
      <form action={unblockAction}>
        <input type="hidden" name="otherId" value={otherId} />
        <Button type="submit" variant="secondary">
          Unblock
        </Button>
      </form>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => dialogRef.current?.showModal()}
      >
        Block
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`block-${otherId}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card bg-canvas p-6 text-body backdrop:bg-ink/40"
      >
        <h2 id={`block-${otherId}`} className="text-display-md">
          Block {otherName}?
        </h2>
        <p className="mt-3">
          You won’t be able to message each other or start new work together.
          Work you’ve already agreed, and any payments, carry on as normal. They
          aren’t told, and you can unblock them from your account.
        </p>
        <form action={blockAction} className="mt-5 flex flex-wrap gap-3">
          <input type="hidden" name="otherId" value={otherId} />
          <Button type="submit">Block</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </Button>
        </form>
      </dialog>
    </>
  );
}
