// What the home pages show: a creator's "get listed" checklist, and the
// campaigns that need a business's attention. No framework imports, so it can
// be unit-tested.

import type { CampaignStatus } from "./campaign.ts";

export type ChecklistItem = {
  id: "niches" | "platform" | "photo" | "about" | "publish";
  label: string;
  done: boolean;
  /** Where to do it; null for publishing, which is a button. */
  href: string | null;
};

export function creatorChecklist(p: {
  niches: readonly string[];
  platformCount: number;
  hasPhoto: boolean;
  bio: string | null;
  startingRateKobo: number | null;
  published: boolean;
}): ChecklistItem[] {
  return [
    {
      id: "niches",
      label: "Choose your niches",
      done: p.niches.length > 0,
      href: "/onboarding/niches",
    },
    {
      id: "platform",
      label: "Add a platform",
      done: p.platformCount > 0,
      href: "/onboarding/platforms",
    },
    {
      id: "photo",
      label: "Add a photo",
      done: p.hasPhoto,
      href: "/onboarding/photo",
    },
    {
      id: "about",
      label: "Write a short bio and set your starting rate",
      done: Boolean(p.bio) && p.startingRateKobo !== null,
      href: "/profile#about",
    },
    {
      id: "publish",
      label: "Publish your profile",
      done: p.published,
      href: null,
    },
  ];
}

export type CampaignAlert = {
  campaignId: string;
  title: string;
  kind: "in_review" | "sent_back" | "taken_down";
  /** The admin's note (sent back) or reason (taken down). */
  note: string | null;
};

export type AlertInput = {
  id: string;
  title: string;
  status: CampaignStatus;
  reviewNote: string | null;
  removedReason: string | null;
  updatedAt: string;
};

const MAX_ALERTS = 3;

/** Campaigns a business should look at, newest first, at most three. */
export function campaignAlerts(
  campaigns: readonly AlertInput[],
): CampaignAlert[] {
  const alerts: (CampaignAlert & { updatedAt: string })[] = [];
  for (const c of campaigns) {
    const base = { campaignId: c.id, title: c.title, updatedAt: c.updatedAt };
    if (c.removedReason) {
      alerts.push({ ...base, kind: "taken_down", note: c.removedReason });
    } else if (c.status === "draft" && c.reviewNote) {
      alerts.push({ ...base, kind: "sent_back", note: c.reviewNote });
    } else if (c.status === "pending_review") {
      alerts.push({ ...base, kind: "in_review", note: null });
    }
  }
  return alerts
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_ALERTS)
    .map(({ campaignId, title, kind, note }) => ({
      campaignId,
      title,
      kind,
      note,
    }));
}

/** "1 live · 1 in review · 2 drafts", for the "Your campaigns" card. */
export function campaignCountsText(
  campaigns: readonly { status: CampaignStatus }[],
): string {
  if (campaigns.length === 0) return "None yet";
  const count = (status: CampaignStatus) =>
    campaigns.filter((c) => c.status === status).length;

  const drafts = count("draft");
  const parts = [
    [count("open"), "live"],
    [count("paused"), "paused"],
    [count("pending_review"), "in review"],
    [drafts, drafts === 1 ? "draft" : "drafts"],
  ] as const;
  const text = parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
  return text || "None live";
}
