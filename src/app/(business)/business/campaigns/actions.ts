"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  BUSINESS_ACTIONS,
  lagosToday,
  parseCampaignForm,
  parseLiveEditForm,
  type CampaignAction,
  type CampaignField,
} from "@/lib/campaign";
import {
  deleteDraft,
  getOwnCampaign,
  saveCampaignDraft,
  transitionCampaign,
  updateLiveCampaign,
} from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";
import { text, type FormState } from "@/lib/form-data";

export type CampaignFormState = FormState<CampaignField>;
export type ActionState = { status: "idle" | "error"; message?: string };

const SAVE_FAILED =
  "We couldn’t save your campaign just now. Please try again in a minute.";

// Every action checks the session and role itself. Ownership is checked by
// the database: row level security and transition_campaign() only let a
// business touch its own campaigns.

export async function saveCampaignAction(
  _previous: CampaignFormState,
  form: FormData,
): Promise<CampaignFormState> {
  await requireRole("business");
  const niches = await listNiches();
  const parsed = parseCampaignForm(
    form,
    niches.map((n) => n.slug),
    lagosToday(),
  );
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      errors: parsed.errors,
      values: parsed.values,
    };
  }

  const existing = text(form, "campaignId");
  let id: string;
  try {
    const saved = await saveCampaignDraft(existing || null, parsed.value);
    if (saved === "not_a_draft") {
      return {
        status: "error",
        message:
          "This campaign has been submitted, so only its wording, places and deadlines can change now.",
        values: typed(form),
      };
    }
    id = saved;
  } catch (error) {
    logFailure("save", error);
    return { status: "error", message: SAVE_FAILED, values: typed(form) };
  }
  redirect(`/business/campaigns/${id}`);
}

export async function liveEditAction(
  _previous: CampaignFormState,
  form: FormData,
): Promise<CampaignFormState> {
  const user = await requireRole("business");
  const id = text(form, "campaignId");
  const campaign = await getOwnCampaign(user.id, id);
  if (!campaign || !["open", "paused"].includes(campaign.status)) {
    return {
      status: "error",
      message: "This campaign can’t be edited now. Refresh to see why.",
    };
  }

  const parsed = parseLiveEditForm(form, campaign);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }
  try {
    const outcome = await updateLiveCampaign(id, parsed.value);
    if (outcome === "locked") {
      return {
        status: "error",
        message: "This campaign can’t be edited now. Refresh to see why.",
        values: typed(form),
      };
    }
  } catch (error) {
    logFailure("live edit", error);
    return { status: "error", message: SAVE_FAILED, values: typed(form) };
  }
  redirect(`/business/campaigns/${id}`);
}

export async function campaignTransitionAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireRole("business");
  const id = text(form, "campaignId");
  const action = text(form, "action") as CampaignAction;
  if (!BUSINESS_ACTIONS.includes(action)) {
    return { status: "error", message: "Unknown action." };
  }

  const result = await transitionCampaign(id, action);
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "invalid"
          ? sentence(result.message)
          : "This campaign changed since you opened it. Refresh the page and try again.",
    };
  }
  refresh();
  return { status: "idle" };
}

export async function deleteDraftAction(form: FormData): Promise<void> {
  await requireRole("business");
  await deleteDraft(text(form, "campaignId"));
  redirect("/business/campaigns");
}

/** What was typed, so a failed save shows it again rather than clearing it. */
function typed(form: FormData): CampaignFormState["values"] {
  const fields: CampaignField[] = [
    "title",
    "brief",
    "guidelines",
    "price",
    "places",
    "applicationsCloseOn",
    "postFrom",
    "deliverBy",
  ];
  return Object.fromEntries(fields.map((f) => [f, text(form, f).trim()]));
}

/** The database's messages are lower-case fragments; make them sentences. */
function sentence(message: string) {
  const trimmed = message.trim();
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}${trimmed.endsWith(".") ? "" : "."}`;
}

function logFailure(what: string, error: unknown) {
  console.error(
    `campaigns: ${what} failed`,
    error instanceof Error ? error.message : error,
  );
}
