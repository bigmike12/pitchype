import assert from "node:assert/strict";
import { test } from "node:test";

import { renderEmail } from "./email-template.ts";

const SITE = "https://pitchype.com";

const view = {
  title: "Ada submitted work for “Summer launch”",
  body: "Review it within 7 days.",
  href: "/jobs/abc",
};

test("subject is the title on one line", () => {
  const { subject } = renderEmail(
    { ...view, title: "Line one\nline  two\r\nthree" },
    SITE,
  );
  assert.equal(subject, "Line one line two three");
});

test("the button links to the absolute address", () => {
  const { html, text } = renderEmail(view, SITE);
  assert.ok(html.includes('href="https://pitchype.com/jobs/abc"'));
  assert.ok(text.includes("https://pitchype.com/jobs/abc"));
});

test("a trailing slash on the site address does not double up", () => {
  const { html, text } = renderEmail(view, "https://pitchype.com/");
  assert.ok(html.includes('href="https://pitchype.com/jobs/abc"'));
  assert.ok(text.includes("https://pitchype.com/jobs/abc"));
  assert.ok(!html.includes("com//"));
});

test("the footer links to the account settings", () => {
  const { html, text } = renderEmail(view, SITE);
  assert.ok(html.includes('href="https://pitchype.com/account"'));
  const readable = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
  assert.ok(
    readable.includes(
      "You can change which emails you get in your account settings.",
    ),
  );
  assert.ok(text.includes("https://pitchype.com/account"));
});

test("html escapes names and previews, text keeps them as written", () => {
  const title = `Tom & "Jerry" <b>x</b>`;
  const body = "<script>alert(1)</script>";
  const { html, text } = renderEmail({ title, body, href: "/x" }, SITE);
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Tom &amp; &quot;Jerry&quot; &lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(text.includes(title));
  assert.ok(text.includes(body));
});

test("the link is escaped inside the attribute", () => {
  const { html } = renderEmail({ ...view, href: '/a?x="1"&y=<2>' }, SITE);
  assert.ok(
    html.includes(
      'href="https://pitchype.com/a?x=&quot;1&quot;&amp;y=&lt;2&gt;"',
    ),
  );
  assert.ok(!html.includes('x="1"'));
});

test("a missing body leaves out the body paragraph", () => {
  const withBody = renderEmail(view, SITE).html;
  const without = renderEmail({ ...view, body: null }, SITE).html;
  assert.ok(withBody.includes("Review it within 7 days."));
  assert.ok(!without.includes("Review it within 7 days."));
  // 26px is the body line's own line-height, so its row is gone, not just empty.
  assert.ok(withBody.includes("line-height: 26px"));
  assert.ok(!without.includes("line-height: 26px"));
  assert.ok(!without.includes("null"));
  assert.ok(!renderEmail({ ...view, body: null }, SITE).text.includes("null"));
});

test("no emoji and no side-stripe borders", () => {
  const { html } = renderEmail(view, SITE);
  assert.ok(!html.includes("border-left"));
  assert.ok(
    !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(html),
  );
});

test("the html has a plain-text twin that carries the same title, body and link", () => {
  const { html, text } = renderEmail(view, SITE);
  for (const part of [
    "Summer launch",
    "Review it within 7 days.",
    "https://pitchype.com/jobs/abc",
  ]) {
    assert.ok(html.includes(part), `html has ${part}`);
    assert.ok(text.includes(part), `text has ${part}`);
  }
  assert.ok(!text.includes("<"));
});

test("the layout is a 600px table with a mobile stack and an Outlook button", () => {
  const { html } = renderEmail(view, SITE);
  assert.ok(html.includes('width="600"'));
  assert.ok(html.includes("@media only screen and (max-width: 600px)"));
  assert.ok(html.includes("<!--[if mso]>"));
  assert.ok(html.includes("v:roundrect"));
});

test("the header is the Pitchype logo picture, loaded from the site", () => {
  const { html, text } = renderEmail(view, SITE);
  assert.ok(html.includes('src="https://pitchype.com/email/header.jpg"'));
  assert.ok(html.includes('alt="Pitchype"'));
  assert.ok(!text.includes("header.jpg"));
  // A trailing slash on the site address must not break the picture's address.
  assert.ok(
    renderEmail(view, "https://pitchype.com/").html.includes(
      'src="https://pitchype.com/email/header.jpg"',
    ),
  );
});

test("the inbox preview is the body, or the title when there is no body", () => {
  const preheader = (html: string) =>
    /max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">([^<]*)</.exec(
      html,
    )?.[1];
  assert.equal(
    preheader(renderEmail(view, SITE).html),
    "Review it within 7 days.",
  );
  assert.equal(
    preheader(renderEmail({ ...view, body: null }, SITE).html),
    "Ada submitted work for “Summer launch”",
  );
});

test("the page address is also shown as text for when the button doesn't open", () => {
  const { html } = renderEmail(view, SITE);
  const readable = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
  assert.ok(
    readable.includes(
      "copy this link into your browser: https://pitchype.com/jobs/abc",
    ),
  );
});

test("the page is light-only so mail apps don't recolour it", () => {
  const { html } = renderEmail(view, SITE);
  assert.ok(html.includes('<meta name="color-scheme" content="light only">'));
});
