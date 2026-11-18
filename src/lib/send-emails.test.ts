import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import type { DueEmail } from "./db/notification-emails.ts";
import { ResendError, type EmailMessage } from "./resend.ts";
import {
  sendDueEmails,
  sendDueEmailsSafely,
  sendEmailsStatus,
  type SendEmailsDeps,
} from "./send-emails.ts";

const realConsoleError = console.error;
let logged: string[] = [];

beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.error = realConsoleError;
});

const ALL_ON = { applications: true, campaigns: true, messages: true };

function due(overrides: {
  id?: string;
  kind?: string;
  readAt?: string | null;
  to?: string;
  role?: DueEmail["role"];
  attempts?: number;
  preferences?: DueEmail["preferences"];
  data?: Record<string, unknown>;
}): DueEmail {
  return {
    notification: {
      id: overrides.id ?? "n1",
      kind: overrides.kind ?? "hire_funded",
      data: overrides.data ?? { campaign_title: "Summer launch" },
      occurredAt: "2026-11-18T10:00:00+00:00",
      readAt: overrides.readAt ?? null,
    },
    attempts: overrides.attempts ?? 1,
    to: overrides.to ?? "ada@example.com",
    role: overrides.role ?? "influencer",
    preferences: overrides.preferences ?? ALL_ON,
  };
}

function fakes(
  rows: DueEmail[],
  options: { failFor?: string[]; status?: number } = {},
) {
  const sent: EmailMessage[] = [];
  const finished: [string, boolean][] = [];
  const claimed: number[] = [];
  const deps: SendEmailsDeps = {
    claimDueEmails: async (max) => {
      claimed.push(max);
      await Promise.resolve();
      return rows;
    },
    finishEmail: async (id, wasSent) => {
      await Promise.resolve();
      finished.push([id, wasSent]);
    },
    sendEmail: async (message) => {
      await Promise.resolve();
      if (options.failFor?.includes(message.to)) {
        throw new ResendError(
          "Resend returned an error",
          options.status ?? 503,
        );
      }
      sent.push(message);
    },
    siteUrl: "https://pitchype.test",
  };
  return { deps, sent, finished, claimed };
}

test("sends a due money email and marks it sent", async () => {
  const { deps, sent, finished, claimed } = fakes([due({})]);
  const result = await sendDueEmails(deps);
  assert.deepEqual(claimed, [15]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ada@example.com");
  assert.ok(sent[0].subject.length > 0);
  assert.ok(sent[0].html.includes("https://pitchype.test"));
  assert.deepEqual(finished, [["n1", true]]);
  assert.deepEqual(result, { sent: 1, skipped: 0, failed: 0 });
});

test("the subject is the described title", async () => {
  const { describeNotification } = await import("./notifications.ts");
  const row = due({});
  const view = describeNotification(row.notification, "influencer");
  assert.ok(view);
  const { deps, sent } = fakes([row]);
  await sendDueEmails(deps);
  assert.equal(sent[0].subject, view.title.replace(/\s+/g, " ").trim());
});

test("an always-send kind ignores switched-off preferences", async () => {
  const off = { applications: false, campaigns: false, messages: false };
  const { deps, sent } = fakes([due({ preferences: off })]);
  const result = await sendDueEmails(deps);
  assert.equal(sent.length, 1);
  assert.equal(result.sent, 1);
});

test("a switched-off group is skipped and cleared", async () => {
  const row = due({
    kind: "application_received",
    role: "business",
    preferences: { ...ALL_ON, applications: false },
    data: { name: "Ada", campaign_title: "Summer launch" },
  });
  const { deps, sent, finished } = fakes([row]);
  const result = await sendDueEmails(deps);
  assert.equal(sent.length, 0);
  assert.deepEqual(finished, [["n1", false]]);
  assert.deepEqual(result, { sent: 0, skipped: 1, failed: 0 });
});

test("a chat row read before the send is skipped", async () => {
  const row = due({
    kind: "new_message",
    readAt: "2026-11-18T10:05:00+00:00",
    data: { name: "Ada" },
  });
  const { deps, sent, finished } = fakes([row]);
  const result = await sendDueEmails(deps);
  assert.equal(sent.length, 0);
  assert.deepEqual(finished, [["n1", false]]);
  assert.equal(result.skipped, 1);
});

test("an unread chat row still sends", async () => {
  const row = due({ kind: "new_message", data: { name: "Ada" } });
  const { deps, sent } = fakes([row]);
  await sendDueEmails(deps);
  assert.equal(sent.length, 1);
});

test("a read money email still sends", async () => {
  const row = due({ readAt: "2026-11-18T10:05:00+00:00" });
  const { deps, sent, finished } = fakes([row]);
  await sendDueEmails(deps);
  assert.equal(sent.length, 1);
  assert.deepEqual(finished, [["n1", true]]);
});

test("an unknown kind and an admin recipient are skipped without a crash", async () => {
  const { deps, sent, finished } = fakes([
    due({ id: "a", kind: "from_the_future" }),
    due({ id: "b", role: "admin" }),
    due({ id: "c" }),
  ]);
  const result = await sendDueEmails(deps);
  assert.equal(sent.length, 1);
  assert.deepEqual(finished, [
    ["a", false],
    ["b", false],
    ["c", true],
  ]);
  assert.deepEqual(result, { sent: 1, skipped: 2, failed: 0 });
});

test("a known kind that describes to nothing is skipped", async () => {
  // describeNotification treats a kind it has no words for as null, so a
  // policy entry added before the words must not crash or send a blank email.
  const { EMAIL_POLICY } = await import("./notification-email.ts");
  EMAIL_POLICY.test_only_kind = "always";
  try {
    const { deps, sent, finished } = fakes([due({ kind: "test_only_kind" })]);
    const result = await sendDueEmails(deps);
    assert.equal(sent.length, 0);
    assert.deepEqual(finished, [["n1", false]]);
    assert.equal(result.skipped, 1);
  } finally {
    delete EMAIL_POLICY.test_only_kind;
  }
});

test("a Resend failure leaves the row for retry and the next row still sends", async () => {
  const { deps, sent, finished } = fakes(
    [
      due({ id: "a", to: "first@example.com" }),
      due({ id: "b", to: "second@example.com" }),
    ],
    { failFor: ["first@example.com"] },
  );
  const result = await sendDueEmails(deps);
  assert.deepEqual(finished, [["b", true]]);
  assert.deepEqual(
    sent.map((m) => m.to),
    ["second@example.com"],
  );
  assert.deepEqual(result, { sent: 1, skipped: 0, failed: 1 });
  assert.equal(logged.length, 0);
});

test("the fifth failed attempt logs once and nothing else", async () => {
  const { deps, finished } = fakes(
    [due({ attempts: 5, to: "secret-person@example.com" })],
    { failFor: ["secret-person@example.com"] },
  );
  const result = await sendDueEmails(deps);
  assert.deepEqual(finished, []);
  assert.equal(result.failed, 1);
  assert.deepEqual(logged, ["send-emails: gave up after 5 attempts"]);
  const text = logged.join("\n");
  assert.equal(text.includes("secret-person"), false);
  assert.equal(text.includes("Summer launch"), false);
});

test("a row that throws before sending is counted and logged by class only", async () => {
  const { deps, sent } = fakes([due({ id: "a" }), due({ id: "b" })]);
  let calls = 0;
  const original = deps.finishEmail;
  deps.finishEmail = async (id, wasSent) => {
    calls += 1;
    if (id === "a") throw new TypeError("secret ada@example.com");
    await original(id, wasSent);
  };
  const result = await sendDueEmails(deps);
  assert.equal(calls, 2);
  assert.equal(sent.length, 2);
  assert.deepEqual(result, { sent: 1, skipped: 0, failed: 1 });
  assert.deepEqual(logged, ["send-emails: TypeError"]);
});

test("the idempotency key is the id and occurred_at", async () => {
  const { deps, sent } = fakes([due({ id: "abc" })]);
  await sendDueEmails(deps);
  assert.equal(sent[0].idempotencyKey, "abc:2026-11-18T10:00:00+00:00");
});

test("rows are sent one at a time, in order", async () => {
  const order: string[] = [];
  const { deps } = fakes([
    due({ id: "a", to: "a@example.com" }),
    due({ id: "b", to: "b@example.com" }),
  ]);
  deps.sendEmail = async (message) => {
    order.push(`start ${message.to}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push(`end ${message.to}`);
  };
  await sendDueEmails(deps);
  assert.deepEqual(order, [
    "start a@example.com",
    "end a@example.com",
    "start b@example.com",
    "end b@example.com",
  ]);
});

test("sendEmailsStatus is 500 only when something failed", () => {
  assert.equal(sendEmailsStatus({ sent: 3, skipped: 2, failed: 0 }), 200);
  assert.equal(sendEmailsStatus({ sent: 0, skipped: 0, failed: 1 }), 500);
});

test("sendDueEmailsSafely swallows a claim failure", async () => {
  const { deps } = fakes([]);
  deps.claimDueEmails = async () => {
    await Promise.resolve();
    throw new Error("claim due emails failed (XX000) ada@example.com");
  };
  await sendDueEmailsSafely(deps);
  assert.deepEqual(logged, ["send-emails: Error"]);
});
