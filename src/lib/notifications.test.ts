import assert from "node:assert/strict";
import { test } from "node:test";

import { describeNotification, type NotificationRow } from "./notifications.ts";

const row = (
  kind: string,
  data: Record<string, unknown> = {},
): NotificationRow => ({
  id: "n1",
  kind,
  data,
  occurredAt: "2026-11-11T10:00:00Z",
  readAt: null,
});

const campaign = { campaign_id: "k1", campaign_title: "Zobo week" };

test("application events link the business to its applicants", () => {
  const d = describeNotification(
    row("application_received", { ...campaign, name: "Tolu" }),
  );
  assert.equal(d?.title, "Tolu applied to “Zobo week”");
  assert.equal(d?.href, "/business/campaigns/k1/applications");

  const w = describeNotification(
    row("application_withdrawn", { ...campaign, name: "Tolu" }),
  );
  assert.equal(w?.href, "/business/campaigns/k1/applications?tab=closed");
});

test("decisions link the creator to the campaign, with the note", () => {
  const hired = describeNotification(
    row("application_hired", { ...campaign, name: "E2E Kitchen" }),
  );
  assert.equal(hired?.title, "E2E Kitchen hired you for “Zobo week”");
  assert.match(hired?.body ?? "", /pay/);
  assert.equal(hired?.href, "/campaigns/k1");

  const passed = describeNotification(
    row("application_passed", {
      ...campaign,
      name: "E2E Kitchen",
      note: "Went with food.",
    }),
  );
  assert.equal(passed?.body, "Went with food.");
  const noNote = describeNotification(
    row("application_passed", { ...campaign, name: "E2E Kitchen", note: null }),
  );
  assert.equal(noNote?.body, null);
});

test("a lapsed hire reads differently for each side", () => {
  const facts = { ...campaign, engagement_id: "e1", name: "Someone" };
  const forBusiness = describeNotification(
    row("hire_lapsed", facts),
    "business",
  );
  const forCreator = describeNotification(
    row("hire_lapsed", facts),
    "influencer",
  );
  assert.equal(forBusiness?.href, "/business/engagements/e1/pay");
  assert.equal(forCreator?.href, "/campaigns/k1");
  assert.notEqual(forBusiness?.title, forCreator?.title);
});

test("messages count and preview, and open the thread", () => {
  const one = describeNotification(
    row("new_message", {
      conversation_id: "c1",
      name: "Ada",
      preview: "Hi",
      count: 1,
    }),
  );
  assert.equal(one?.title, "New message from Ada");
  assert.equal(one?.body, "Hi");
  assert.equal(one?.href, "/inbox/c1");
  const three = describeNotification(
    row("new_message", {
      conversation_id: "c1",
      name: "Ada",
      preview: "Hi",
      count: 3,
    }),
  );
  assert.equal(three?.title, "3 new messages from Ada");
});

test("verification names the platform", () => {
  const d = describeNotification(
    row("verification_approved", { platform: "instagram", handle: "tolu" }),
  );
  assert.equal(d?.title, "Your Instagram account is verified");
  assert.equal(d?.href, "/profile");
});

test("missing facts never show 'undefined'", () => {
  for (const kind of [
    "application_received",
    "application_updated",
    "application_withdrawn",
    "application_shortlisted",
    "application_hired",
    "application_passed",
    "hire_cancelled",
    "hire_lapsed",
    "new_message",
    "campaign_approved",
    "campaign_sent_back",
    "campaign_taken_down",
    "verification_approved",
    "verification_rejected",
    "profile_hidden",
    "profile_restored",
    "appeal_answered",
  ]) {
    const d = describeNotification(row(kind));
    assert.ok(d, kind);
    assert.doesNotMatch(
      `${d.title} ${d.body ?? ""} ${d.href}`,
      /undefined|null/,
      kind,
    );
  }
});

test("unknown kinds are skipped, not shown blank", () => {
  assert.equal(describeNotification(row("payment_received")), null);
});
