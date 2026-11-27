import assert from "node:assert/strict";
import { test } from "node:test";

import {
  greetingName,
  renderEmail,
  type RenderOptions,
} from "./email-template.ts";
import type { EmailCopy } from "./notification-email-copy.ts";
import { CONTACT_EMAIL, SOCIAL_PROFILES } from "./site.ts";

const options: RenderOptions = {
  siteUrl: "https://pitchype.com",
  role: "business",
  name: "Ada Obi",
  switchable: false,
};

const copy: EmailCopy = {
  subject: "Tolu sent in their work for “Summer launch”",
  preview: "Tolu has sent in their work.",
  blocks: [
    { type: "p", text: "Tolu has sent in their work." },
    { type: "quote", label: "Their note", text: "Posted on Friday." },
    {
      type: "list",
      title: "Your options",
      items: ["Accept it.", "Send it back."],
    },
  ],
  button: "Review the work",
  href: "/jobs/abc",
};

const readable = (html: string) =>
  html
    .replace(/<br>/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ");

test("subject is the copy's subject on one line", () => {
  const { subject } = renderEmail(
    { ...copy, subject: "Line one\nline  two\r\nthree" },
    options,
  );
  assert.equal(subject, "Line one line two three");
});

test("greets a business by first name, a creator by display name, else there", () => {
  assert.equal(greetingName("business", "Ada Obi"), "Ada");
  assert.equal(greetingName("influencer", "Tolu Eats"), "Tolu Eats");
  assert.equal(greetingName("influencer", null), "there");
  assert.equal(greetingName("business", "   "), "there");
  const { html, text } = renderEmail(copy, options);
  assert.ok(readable(html).includes("Hi Ada,"));
  assert.ok(text.includes("Hi Ada,"));
});

test("every block is in the html and the text, in order", () => {
  const { html, text } = renderEmail(copy, options);
  const words = readable(html);
  for (const part of [
    "Tolu has sent in their work.",
    "Their note",
    "Posted on Friday.",
    "Your options",
    "Accept it.",
    "Send it back.",
  ]) {
    assert.ok(words.includes(part), `html has ${part}`);
    assert.ok(text.includes(part), `text has ${part}`);
  }
  assert.ok(words.indexOf("Tolu has sent") < words.indexOf("Their note"));
  assert.ok(words.indexOf("Posted on Friday.") < words.indexOf("Your options"));
  assert.ok(text.includes("- Accept it."));
});

test("the button names the action and links to the absolute address", () => {
  const { html, text } = renderEmail(copy, options);
  assert.ok(html.includes('href="https://pitchype.com/jobs/abc"'));
  assert.ok(html.includes(">Review the work</a>"));
  assert.ok(text.includes("Review the work: https://pitchype.com/jobs/abc"));
});

test("a trailing slash on the site address does not double up", () => {
  const { html, text } = renderEmail(copy, {
    ...options,
    siteUrl: "https://pitchype.com/",
  });
  assert.ok(html.includes('href="https://pitchype.com/jobs/abc"'));
  assert.ok(text.includes("https://pitchype.com/jobs/abc"));
  assert.ok(!html.includes("com//"));
});

test("signs off from the team", () => {
  const { html, text } = renderEmail(copy, options);
  assert.ok(readable(html).includes("Talk soon, The Pitchype team"));
  assert.ok(text.includes("Talk soon,\nThe Pitchype team"));
});

test("the footer links every Pitchype social profile and the contact address", () => {
  const { html, text } = renderEmail(copy, options);
  for (const profile of SOCIAL_PROFILES) {
    assert.ok(html.includes(`href="${profile.url}"`), profile.label);
    assert.ok(text.includes(profile.url), profile.label);
  }
  assert.ok(html.includes(`href="mailto:${CONTACT_EMAIL}"`));
  assert.ok(text.includes(CONTACT_EMAIL));
});

test("a switchable email points at the settings; an always email says why it can't be switched off", () => {
  const switchable = renderEmail(copy, { ...options, switchable: true });
  assert.ok(
    readable(switchable.html).includes(
      "You can change which emails you get in your account settings.",
    ),
  );
  assert.ok(!switchable.text.includes("We always send this one"));
  const always = renderEmail(copy, options);
  assert.ok(
    readable(always.html).includes(
      "We always send this one because it’s about your money, a deadline or your account.",
    ),
  );
  for (const { html, text } of [switchable, always]) {
    assert.ok(html.includes('href="https://pitchype.com/account"'));
    assert.ok(text.includes("https://pitchype.com/account"));
  }
});

test("html escapes every field, text keeps them as written", () => {
  const nasty = `Tom & "Jerry" <b>x</b>`;
  const evil: EmailCopy = {
    subject: nasty,
    preview: nasty,
    blocks: [
      { type: "p", text: "<script>alert(1)</script>" },
      { type: "quote", label: "<i>Why</i>", text: "<img src=x>" },
      { type: "list", title: "<u>t</u>", items: ["<a href=evil>go</a>"] },
    ],
    button: "<b>Go</b>",
    href: "/x",
  };
  const { html, text } = renderEmail(evil, { ...options, name: "<Ada>" });
  for (const raw of [
    "<b>x</b>",
    "<script>",
    "<i>Why</i>",
    "<img src=x>",
    "<u>t</u>",
    "<a href=evil>",
    "<b>Go</b>",
    "<Ada>",
  ]) {
    assert.ok(!html.includes(raw), raw);
  }
  assert.ok(html.includes("Tom &amp; &quot;Jerry&quot; &lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(text.includes(nasty));
  assert.ok(text.includes("<script>alert(1)</script>"));
});

test("the link is escaped inside the attribute", () => {
  const { html } = renderEmail({ ...copy, href: '/a?x="1"&y=<2>' }, options);
  assert.ok(
    html.includes(
      'href="https://pitchype.com/a?x=&quot;1&quot;&amp;y=&lt;2&gt;"',
    ),
  );
  assert.ok(!html.includes('x="1"'));
});

test("no emoji and no side-stripe borders", () => {
  const { html } = renderEmail(copy, options);
  assert.ok(!html.includes("border-left"));
  assert.ok(
    !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(html),
  );
});

test("the plain-text twin has no markup", () => {
  assert.ok(!renderEmail(copy, options).text.includes("<"));
});

test("the layout is a 600px table with a mobile stack and an Outlook button", () => {
  const { html } = renderEmail(copy, options);
  assert.ok(html.includes('width="600"'));
  assert.ok(html.includes("@media only screen and (max-width: 600px)"));
  assert.ok(html.includes("<!--[if mso]>"));
  assert.ok(html.includes("v:roundrect"));
});

test("the header is the Pitchype logo picture, loaded from the site", () => {
  const { html, text } = renderEmail(copy, options);
  assert.ok(html.includes('src="https://pitchype.com/email/header.jpg"'));
  assert.ok(html.includes('alt="Pitchype"'));
  assert.ok(!text.includes("header.jpg"));
});

test("the inbox preview is the copy's preview", () => {
  const preheader =
    /max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">([^<]*)</.exec(
      renderEmail(copy, options).html,
    )?.[1];
  assert.equal(preheader, "Tolu has sent in their work.");
});

test("the page address is also shown as text for when the button doesn't open", () => {
  assert.ok(
    readable(renderEmail(copy, options).html).includes(
      "copy this link into your browser: https://pitchype.com/jobs/abc",
    ),
  );
});

test("the page is light-only so mail apps don't recolour it", () => {
  assert.ok(
    renderEmail(copy, options).html.includes(
      '<meta name="color-scheme" content="light only">',
    ),
  );
});
