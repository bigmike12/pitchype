"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { parseCompanyType } from "@/lib/company-types";
import {
  finishIdentityCheck,
  getRecentCacCache,
  startIdentityCheck,
} from "@/lib/db/identity";
import {
  type CacResult,
  DojahError,
  isDojahConfigured,
  lookupCacAdvanced,
  widgetConfig,
} from "@/lib/dojah";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import type { FormState } from "@/lib/form-data";
import { text } from "@/lib/form-data";
import { buildCacDecision, cacFromCache } from "@/lib/identity";
import {
  IDENTITY_LIMITED_MESSAGE,
  isIdentityStartLimited,
} from "@/lib/identity-limits";
import { parseRegistrationNumber, splitLegalName } from "@/lib/identity-names";
import { refusalText } from "@/lib/refusals";

// Identity checks started from the account page and from onboarding. Each
// action authenticates, checks the role, validates, rate-limits and only then
// calls the database or Dojah. Nothing here logs a name, an ID number or an
// event (design §6.3).

const UNAVAILABLE =
  "Identity checks aren’t available right now. Please try again later.";
const REGISTRY_DOWN =
  "We couldn’t reach the company registry just now. Please try again in a few minutes.";

const PERSON_KINDS = {
  creator_nin: { role: "influencer", id: "NIN" },
  owner_bvn: { role: "business", id: "BVN" },
  director_bvn: { role: "business", id: "BVN" },
} as const;

export type PersonCheckStart =
  | {
      status: "ready";
      reference: string;
      widget: { appId: string; publicKey: string; widgetId: string };
      prefill: { firstName: string; lastName: string };
    }
  | { status: "error"; message: string };

/**
 * Starts (or resumes) a NIN or BVN check and returns what the browser needs to
 * open Dojah's widget. The result is decided later, by Dojah's webhook.
 */
export async function startPersonCheckAction(
  kind: keyof typeof PERSON_KINDS,
  form: FormData,
): Promise<PersonCheckStart> {
  const rule = Object.hasOwn(PERSON_KINDS, kind) ? PERSON_KINDS[kind] : null;
  if (!rule) return { status: "error", message: refusalText("invalid_kind") };
  const user = await requireRole(rule.role);

  const name = splitLegalName(text(form, "legalName"));
  if (!name.ok) {
    return {
      status: "error",
      message:
        "Enter your first and last name exactly as they appear on your ID.",
    };
  }
  if (!isDojahConfigured()) return { status: "error", message: UNAVAILABLE };
  if (await isIdentityStartLimited(user.id)) {
    return { status: "error", message: IDENTITY_LIMITED_MESSAGE };
  }

  const started = await startIdentityCheck(kind, name.full);
  if (!started.ok) {
    return { status: "error", message: refusalText(started.reason) };
  }
  return {
    status: "ready",
    reference: started.value.reference,
    widget: widgetConfig(rule.id),
    prefill: { firstName: name.firstName, lastName: name.lastName },
  };
}

export type CacState = FormState<"name" | "companyType" | "rcNumber">;

/**
 * Checks a registered business against CAC through Dojah, right away. A
 * corrected name within 24 hours is compared with the answer already paid
 * for, so a typo costs no second lookup.
 */
export async function verifyCacAction(
  _previous: CacState,
  form: FormData,
): Promise<CacState> {
  const user = await requireRole("business");
  const values = {
    name: text(form, "name"),
    companyType: text(form, "companyType"),
    rcNumber: text(form, "rcNumber"),
  };

  const errors: NonNullable<CacState["errors"]> = {};
  const name = splitCompanyName(values.name);
  if (name === null)
    errors.name = "Enter the name CAC has on record, 3 to 200 characters.";
  const companyType = parseCompanyType(values.companyType);
  if (companyType === null)
    errors.companyType = "Choose the kind of registration.";
  const rc = parseRegistrationNumber(values.rcNumber);
  if (!rc.ok)
    errors.rcNumber =
      "Enter the number from your CAC certificate, digits only.";
  if (name === null || companyType === null || !rc.ok) {
    return { status: "error", errors, values };
  }

  if (!isDojahConfigured()) {
    return { status: "error", message: UNAVAILABLE, values };
  }
  if (await isIdentityStartLimited(user.id)) {
    return { status: "error", message: IDENTITY_LIMITED_MESSAGE, values };
  }

  const started = await startIdentityCheck("business_cac", name);
  if (!started.ok) {
    return { status: "error", message: refusalText(started.reason), values };
  }

  // A corrected name is compared with the answer kept from the last lookup.
  let cac: CacResult | null = cacFromCache(
    await getRecentCacCache(user.id, rc.digits),
  );
  const lookedUp = cac === null;
  if (cac === null) {
    try {
      cac = await lookupCacAdvanced(rc.digits, companyType);
    } catch (error) {
      // The check stays open: it was not answered, so it is not counted.
      console.error(
        "identity: cac lookup failed",
        error instanceof DojahError ? error.status : "error",
      );
      return { status: "error", message: REGISTRY_DOWN, values };
    }
  }
  return record(started.value.reference, {
    enteredName: name,
    companyType,
    rcNumber: rc.digits,
    cac,
    lookedUp,
    values,
    next: text(form, "next"),
  });
}

function splitCompanyName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 3 && name.length <= 200 ? name : null;
}

async function record(
  reference: string,
  input: Parameters<typeof buildCacDecision>[0] & {
    values: Record<string, string>;
    next: string;
  },
): Promise<CacState> {
  const decision = buildCacDecision(input);
  const result = await finishIdentityCheck(
    reference,
    decision,
    `cac:${reference}`,
  );
  sendEmailsAfterResponse();

  if (result === "verified") {
    if (input.next === "onboarding") redirect("/onboarding/done");
    revalidatePath("/account");
    return {
      status: "success",
      message: "Your company is confirmed.",
      values: input.values,
    };
  }
  if (result === "needs_review") {
    if (input.next === "onboarding") redirect("/onboarding/done");
    revalidatePath("/account");
    return {
      status: "success",
      message:
        "We’re taking a closer look. This usually takes 1–2 working days.",
      values: input.values,
    };
  }
  return {
    status: "error",
    message: failureMessage(decision.reason, input.cac),
    values: input.values,
  };
}

function failureMessage(
  reason: unknown,
  cac: Parameters<typeof buildCacDecision>[0]["cac"],
): string {
  switch (reason) {
    case "name_mismatch":
      // CAC's name is public registry data: showing it lets a typo be fixed.
      return cac.found
        ? `CAC lists this company as “${cac.companyName}”. Use that name, then check again.`
        : "The name doesn’t match CAC’s records. Check the spelling and try again.";
    case "company_not_found":
      return "We couldn’t find that registration number at CAC. Check the number and the kind of registration.";
    case "company_inactive":
      return "CAC lists this company as not active. Contact us if that looks wrong.";
    default:
      return "We couldn’t confirm that company. Please try again.";
  }
}
