import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyClient,
  clickSource,
  destinationWithTags,
  hashUserAgent,
  hashVisitor,
  LINK_CODE,
  referrerHost,
} from "./clicks.ts";

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const NO_PREFETCH = { purpose: null, secPurpose: null };

test("link previews, bots and people", () => {
  assert.equal(classifyClient("HEAD", SAFARI, NO_PREFETCH), "preview");
  assert.equal(classifyClient("GET", null, NO_PREFETCH), "bot");
  assert.equal(classifyClient("GET", "", NO_PREFETCH), "bot");
  assert.equal(
    classifyClient("GET", "WhatsApp/2.23.20.0 A", NO_PREFETCH),
    "preview",
  );
  assert.equal(
    classifyClient("GET", "TelegramBot (like TwitterBot)", NO_PREFETCH),
    "preview",
  );
  assert.equal(
    classifyClient(
      "GET",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      NO_PREFETCH,
    ),
    "preview",
  );
  assert.equal(classifyClient("GET", "Twitterbot/1.0", NO_PREFETCH), "preview");
  assert.equal(
    classifyClient(
      "GET",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      NO_PREFETCH,
    ),
    "bot",
  );
  assert.equal(classifyClient("GET", "curl/8.4.0", NO_PREFETCH), "bot");
  assert.equal(
    classifyClient("GET", SAFARI, { purpose: "prefetch", secPurpose: null }),
    "preview",
  );
  assert.equal(
    classifyClient("GET", SAFARI, {
      purpose: null,
      secPurpose: "prefetch;prerender",
    }),
    "preview",
  );
  assert.equal(classifyClient("GET", SAFARI, NO_PREFETCH), "human");
});

test("where a click came from", () => {
  const cases: [string | null, string | null, string][] = [
    ["https://l.facebook.com/", SAFARI, "facebook"],
    ["https://lm.facebook.com/l.php?u=x", SAFARI, "facebook"],
    ["https://l.instagram.com/", SAFARI, "instagram"],
    ["https://t.co/x", SAFARI, "x"],
    ["https://x.com/someone", SAFARI, "x"],
    ["https://web.telegram.org/", SAFARI, "telegram"],
    ["https://web.whatsapp.com/", SAFARI, "whatsapp"],
    ["https://www.tiktok.com/", SAFARI, "tiktok"],
    ["https://m.youtube.com/", SAFARI, "youtube"],
    ["https://www.snapchat.com/", SAFARI, "snapchat"],
    ["https://blog.example.com/", SAFARI, "other_site"],
    [null, "Mozilla/5.0 (iPhone) Instagram 300.0.0.0", "instagram"],
    [null, "Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/440.0]", "facebook"],
    [null, "Mozilla/5.0 (Linux) BytedanceWebview/d8a21c6", "tiktok"],
    [null, "Mozilla/5.0 (iPhone) Snapchat/12.80", "snapchat"],
    [null, "WhatsApp/2.23.20.0 A", "whatsapp"],
    [null, "TelegramBot (like TwitterBot)", "telegram"],
    [null, SAFARI, "unknown"],
    ["not a url", SAFARI, "unknown"],
  ];
  for (const [referrer, ua, want] of cases) {
    assert.equal(clickSource(referrer, ua), want, `${referrer} / ${ua}`);
  }
});

test("only the referrer's host is kept", () => {
  assert.equal(
    referrerHost("https://l.facebook.com/l.php?u=secret"),
    "l.facebook.com",
  );
  assert.equal(referrerHost(null), null);
  assert.equal(referrerHost("not a url"), null);
});

test("tracking tags are added to the destination", () => {
  assert.equal(
    destinationWithTags("https://konga.com/xmas?ref=a#top", {
      utmTags: true,
      campaignId: "c1",
      code: "k7Xq2ab",
    }),
    "https://konga.com/xmas?ref=a&utm_source=pitchype&utm_medium=creator&utm_campaign=c1&utm_content=k7Xq2ab#top",
  );
  assert.equal(
    destinationWithTags("https://konga.com/xmas?ref=a#top", {
      utmTags: false,
      campaignId: "c1",
      code: "k7Xq2ab",
    }),
    "https://konga.com/xmas?ref=a#top",
  );
  assert.equal(
    destinationWithTags("https://konga.com/?utm_source=x", {
      utmTags: true,
      campaignId: "c1",
      code: "k7Xq2ab",
    }),
    "https://konga.com/?utm_source=pitchype&utm_medium=creator&utm_campaign=c1&utm_content=k7Xq2ab",
  );
});

test("visitors are hashed with a secret", () => {
  const a = hashVisitor("s", "1.2.3.4", "ua");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(hashVisitor("s", "1.2.3.4", "ua"), a);
  assert.notEqual(hashVisitor("s2", "1.2.3.4", "ua"), a);
  assert.notEqual(hashVisitor("s", "1.2.3.5", "ua"), a);
  assert.match(hashUserAgent("s", "ua"), /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("1.2.3.4"));
});

test("link codes are seven letters or digits", () => {
  assert.ok(LINK_CODE.test("k7Xq2ab"));
  for (const bad of ["k7Xq2a", "k7Xq2ab1", "k7Xq-ab", "../x", ""]) {
    assert.ok(!LINK_CODE.test(bad), bad);
  }
});

test("non-ASCII destinations come out as a valid header value", () => {
  for (const utmTags of [false, true]) {
    const out = destinationWithTags("https://jumia.com.ng/₦-deals", {
      utmTags,
      campaignId: "c1",
      code: "k7Xq2ab",
    });
    assert.ok(/^[\x21-\x7e]+$/.test(out), out);
    assert.doesNotThrow(() => new Headers({ Location: out }));
  }
});

test("Android app referrers name their app", () => {
  const cases: [string, string][] = [
    ["android-app://com.whatsapp/", "whatsapp"],
    ["android-app://com.whatsapp.w4b/", "whatsapp"],
    ["android-app://org.telegram.messenger/", "telegram"],
    ["android-app://com.facebook.katana/", "facebook"],
    ["android-app://com.instagram.android/", "instagram"],
    ["android-app://com.zhiliaoapp.musically/", "tiktok"],
    ["android-app://com.twitter.android/", "x"],
    ["android-app://com.google.android.youtube/", "youtube"],
    ["android-app://com.snapchat.android/", "snapchat"],
    ["android-app://com.some.other.app/", "other_site"],
  ];
  for (const [referrer, want] of cases) {
    assert.equal(clickSource(referrer, null), want, referrer);
  }
});
