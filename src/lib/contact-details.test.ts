import assert from "node:assert/strict";
import { test } from "node:test";

import { findContactDetails } from "./contact-details.ts";

test("finds Nigerian phone numbers however they're written", () => {
  for (const text of [
    "Call 08031234567 for details",
    "Call 0803 123 4567",
    "+234 803 123 4567",
    "+2348031234567",
    "0803-123-4567",
  ]) {
    assert.equal(findContactDetails(text), "phone number", text);
  }
});

test("finds WhatsApp and Telegram links and emails", () => {
  assert.equal(
    findContactDetails("Chat on https://wa.me/2348031234567"),
    "WhatsApp link",
  );
  assert.equal(
    findContactDetails("join chat.whatsapp.com/AbCdEf"),
    "WhatsApp link",
  );
  assert.equal(findContactDetails("t.me/brightside"), "Telegram link");
  assert.equal(findContactDetails("Email ada@brightside.ng"), "email address");
});

test("leaves ordinary brief text alone", () => {
  for (const text of [
    "Tag @brightside and use #ZoboSeason",
    "Budget is ₦50,000 per creator, 2 reels and 3 stories",
    "Post between 2026-11-09 and 2026-11-20",
    "Share it on your WhatsApp status too",
    "Our 2024 sales grew 300 percent",
  ]) {
    assert.equal(findContactDetails(text), null, text);
  }
});

// Chat strikes (Stage 5) depend on these not being flagged. The same strings
// are checked against the database's copy of the patterns in
// supabase/tests/moderation_rls.test.sql; keep the two lists in step.
test("chat: ordinary messages aren't flagged", () => {
  for (const text of [
    "Can you do it for ₦50,000?",
    "Deliver by 12/12/2026 please",
    "Call me at 5pm on the app",
    "Tag @brightside.ng in the reel",
    "2 reels and 3 stories",
  ]) {
    assert.equal(findContactDetails(text), null, text);
  }
});

test("chat: a phone number in a message is flagged", () => {
  assert.equal(
    findContactDetails("0803 123 4567 is my number"),
    "phone number",
  );
});
