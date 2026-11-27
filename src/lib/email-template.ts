import type { EmailBlock, EmailCopy } from "./notification-email-copy.ts";
import { CONTACT_EMAIL, SOCIAL_PROFILES } from "./site.ts";

// Email clients can't read CSS variables, so the colours below are literal
// copies of the tokens in src/app/globals.css. Change them there first.
const PORCELAIN = "#f8f8f6"; // --color-canvas
const SURFACE = "#ffffff"; // --color-surface
const INK = "#0e0e10"; // --color-ink
const BODY = "#3b3b42"; // --color-body
const MUTED = "#63636b"; // --color-muted (only on porcelain or white, never on a tint)
const HAIRLINE = "#e6e6e1"; // --color-hairline
const VIOLET = "#5b3df5"; // --color-brand-violet

// Web-safe stacks: Bricolage Grotesque and Inter are not available in mail
// apps. The system UI fonts give each device its own clean sans.
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// The header is a picture (the coral mark and the wordmark in Bricolage
// Grotesque over the soft aurora) because mail apps can't draw either the
// font or the gradient. It lives in public/email/ and is the one file the
// email loads from the site, so it only appears once that file is deployed.
const HEADER_PATH = "/email/header.jpg";

const SIGN_OFF = ["Talk soon,", "The Pitchype team"];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Who "Hi …," names: the first word of a business's contact name (a person),
 * a creator's display name as they wrote it (it may be a brand), or "there".
 */
export function greetingName(
  role: "business" | "influencer",
  name: string | null,
): string {
  const clean = name ? oneLine(name) : "";
  if (clean === "") return "there";
  return role === "business" ? clean.split(" ")[0] : clean;
}

export type RenderOptions = {
  siteUrl: string;
  role: "business" | "influencer";
  name: string | null;
  /** False for "always" kinds (money, deadlines, the account). */
  switchable: boolean;
};

const PARAGRAPH_STYLE = `font-family: ${FONT}; font-size: 16px; line-height: 26px; color: ${BODY};`;

function blockHtml(block: EmailBlock): string {
  if (block.type === "p") {
    return `<tr>
                  <td class="pad" style="padding: 0 40px 18px 40px; ${PARAGRAPH_STYLE}">${escapeHtml(block.text)}</td>
                </tr>`;
  }
  if (block.type === "quote") {
    return `<tr>
                  <td class="pad" style="padding: 2px 40px 20px 40px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${PORCELAIN}; border: 1px solid ${HAIRLINE}; border-radius: 14px;">
                      <tr>
                        <td style="padding: 14px 18px 16px 18px; font-family: ${FONT};">
                          <div style="font-size: 13px; line-height: 20px; font-weight: bold; color: ${MUTED};">${escapeHtml(block.label)}</div>
                          <div style="padding-top: 4px; font-size: 16px; line-height: 25px; color: ${INK};">${escapeHtml(block.text)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
  }
  const items = block.items
    .map(
      (item) => `<tr>
                        <td valign="top" style="width: 18px; padding: 0 0 8px 0; ${PARAGRAPH_STYLE} color: ${VIOLET}; font-weight: bold;">&bull;</td>
                        <td valign="top" style="padding: 0 0 8px 0; ${PARAGRAPH_STYLE}">${escapeHtml(item)}</td>
                      </tr>`,
    )
    .join("\n                      ");
  return `<tr>
                  <td class="pad" style="padding: 2px 40px 14px 40px;">
                    <div style="padding-bottom: 8px; font-family: ${FONT}; font-size: 16px; line-height: 24px; font-weight: bold; color: ${INK};">${escapeHtml(block.title)}</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${items}
                    </table>
                  </td>
                </tr>`;
}

function blockText(block: EmailBlock): string {
  if (block.type === "p") return block.text;
  if (block.type === "quote") return `${block.label}:\n"${block.text}"`;
  return [block.title, ...block.items.map((item) => `- ${item}`)].join("\n");
}

/**
 * The email for one notification: the heading, a greeting, the copy's
 * paragraphs, quotes and lists, one button to the page, a sign-off, and a
 * footer with our socials, the contact address and the email settings. The
 * words come from `describeEmail`; nothing here writes copy per kind.
 */
export function renderEmail(
  copy: EmailCopy,
  options: RenderOptions,
): { subject: string; html: string; text: string } {
  const base = options.siteUrl.replace(/\/+$/, "");
  const link = `${base}${copy.href}`;
  const settingsLink = `${base}/account`;
  const preferenceLine = options.switchable
    ? "You can change which emails you get in your"
    : "We always send this one because it’s about your money, a deadline or your account. You can change your other emails in your";
  const greeting = `Hi ${greetingName(options.role, options.name)},`;

  const subject = oneLine(copy.subject);
  const title = escapeHtml(subject);
  const linkAttr = escapeHtml(link);
  const settingsAttr = escapeHtml(settingsLink);
  const headerAttr = escapeHtml(`${base}${HEADER_PATH}`);
  const buttonLabel = escapeHtml(copy.button);
  // What the inbox list shows after the subject.
  const preheader = escapeHtml(oneLine(copy.preview));

  const blocks = copy.blocks.map(blockHtml).join("\n                ");
  const socials = SOCIAL_PROFILES.map(
    (profile) =>
      `<a href="${escapeHtml(profile.url)}" style="color: ${INK}; text-decoration: underline;">${escapeHtml(profile.label)}</a>`,
  ).join(" &middot; ");

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${title}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style>
    :root { color-scheme: light only; supported-color-schemes: light only; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .pad { padding-left: 24px !important; padding-right: 24px !important; }
      .button-cell { padding-left: 24px !important; padding-right: 24px !important; }
      .button { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      .title { font-size: 24px !important; line-height: 30px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${PORCELAIN};">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${PORCELAIN};">
    <tr>
      <td align="center" style="padding: 32px 12px 40px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px;">
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${SURFACE}; border: 1px solid ${HAIRLINE}; border-radius: 20px; overflow: hidden; box-shadow: 0 1px 2px rgba(14, 14, 16, 0.04), 0 12px 32px -12px rgba(14, 14, 16, 0.12);">
                <tr>
                  <td style="padding: 0; font-size: 0; line-height: 0; background-color: ${PORCELAIN};">
                    <img src="${headerAttr}" width="600" alt="Pitchype" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; font-family: ${FONT}; font-size: 24px; line-height: 74px; font-weight: bold; color: ${INK};">
                  </td>
                </tr>
                <tr>
                  <td class="pad title" style="padding: 40px 40px 20px 40px; font-family: ${FONT}; font-size: 26px; line-height: 33px; font-weight: bold; letter-spacing: -0.02em; color: ${INK};">
                    ${title}
                  </td>
                </tr>
                <tr>
                  <td class="pad" style="padding: 0 40px 18px 40px; ${PARAGRAPH_STYLE}">${escapeHtml(greeting)}</td>
                </tr>
                ${blocks}
                <tr>
                  <td class="button-cell" style="padding: 10px 40px 28px 40px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${linkAttr}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="24%" stroke="f" fillcolor="${VIOLET}">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:${FONT};font-size:16px;font-weight:bold;">${buttonLabel}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a class="button" href="${linkAttr}" style="display: inline-block; background-color: ${VIOLET}; color: #ffffff; font-family: ${FONT}; font-size: 16px; line-height: 20px; font-weight: bold; text-decoration: none; text-align: center; padding: 15px 32px; border-radius: 12px; box-shadow: 0 8px 18px -8px rgba(91, 61, 245, 0.6);">${buttonLabel}</a>
                    <!--<![endif]-->
                  </td>
                </tr>
                <tr>
                  <td class="pad" style="padding: 0 40px 32px 40px; ${PARAGRAPH_STYLE}">
                    ${SIGN_OFF.map(escapeHtml).join("<br>")}
                  </td>
                </tr>
                <tr>
                  <td class="pad" style="padding: 22px 40px 28px 40px; border-top: 1px solid ${HAIRLINE}; font-family: ${FONT}; font-size: 13px; line-height: 20px; color: ${MUTED};">
                    If the button doesn&#39;t open, copy this link into your browser:<br>
                    <a href="${linkAttr}" style="color: ${INK}; text-decoration: underline; word-break: break-all;">${escapeHtml(link)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding: 24px 24px 0 24px; font-family: ${FONT}; font-size: 13px; line-height: 20px; color: ${MUTED};">
              Follow Pitchype on ${socials}.<br>
              Questions? Write to us at <a href="mailto:${escapeHtml(CONTACT_EMAIL)}" style="color: ${INK}; text-decoration: underline;">${escapeHtml(CONTACT_EMAIL)}</a>.
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding: 12px 24px 0 24px; font-family: ${FONT}; font-size: 13px; line-height: 20px; color: ${MUTED};">
              ${escapeHtml(preferenceLine)} <a href="${settingsAttr}" style="color: ${INK}; text-decoration: underline;">account settings</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = [
    subject,
    "",
    greeting,
    "",
    ...copy.blocks.flatMap((block) => [blockText(block), ""]),
    `${copy.button}: ${link}`,
    "",
    ...SIGN_OFF,
    "",
    "--",
    `Follow Pitchype: ${SOCIAL_PROFILES.map((profile) => `${profile.label} ${profile.url}`).join(" | ")}`,
    `Questions? Write to us at ${CONTACT_EMAIL}.`,
    `${preferenceLine} account settings: ${settingsLink}`,
    "",
  ].join("\n");

  return { subject, html, text };
}
