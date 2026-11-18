import type { NotificationView } from "./notifications.ts";

// Email clients can't read CSS variables, so the colours below are literal
// copies of the tokens in src/app/globals.css. Change them there first.
const PORCELAIN = "#f8f8f6"; // --color-canvas
const SURFACE = "#ffffff"; // --color-surface
const INK = "#0e0e10"; // --color-ink
const BODY = "#3b3b42"; // --color-body
const MUTED = "#63636b"; // --color-muted (only on porcelain or white, never on a tint)
const HAIRLINE = "#e6e6e1"; // --color-hairline
const VIOLET = "#5b3df5"; // --color-brand-violet

// Web-safe stacks: Bricolage Grotesque and Inter are not available in mail apps.
const FONT = "Helvetica, Arial, sans-serif";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * The email for one notification: the title, the optional body line, one
 * button to the page, and a footer that points at the email settings. The
 * words come from `describeNotification`; nothing here writes copy per kind.
 */
export function renderEmail(
  view: NotificationView,
  siteUrl: string,
): { subject: string; html: string; text: string } {
  const base = siteUrl.replace(/\/+$/, "");
  const link = `${base}${view.href}`;
  const settingsLink = `${base}/account`;
  const footerStart = "You can change which emails you get in your";
  const buttonLabel = "Open in Pitchype";

  const subject = view.title.replace(/\s+/g, " ").trim();

  const title = escapeHtml(view.title);
  const linkAttr = escapeHtml(link);
  const settingsAttr = escapeHtml(settingsLink);

  const bodyRow = view.body
    ? `<tr>
              <td style="padding: 0 32px 24px 32px; font-family: ${FONT}; font-size: 16px; line-height: 24px; color: ${BODY};" class="pad">
                ${escapeHtml(view.body)}
              </td>
            </tr>`
    : "";

  const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .pad { padding-left: 20px !important; padding-right: 20px !important; }
      .button-cell { padding-left: 20px !important; padding-right: 20px !important; }
      .button { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${PORCELAIN};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${PORCELAIN};">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px;">
          <tr>
            <td style="padding: 0 8px 16px 8px; font-family: ${FONT}; font-size: 22px; font-weight: bold; color: ${INK};">
              Pitchype
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${SURFACE}; border: 1px solid ${HAIRLINE}; border-radius: 16px;">
            <tr>
              <td style="padding: 32px 32px 12px 32px; font-family: ${FONT}; font-size: 24px; line-height: 30px; font-weight: bold; color: ${INK};" class="pad">
                ${title}
              </td>
            </tr>
            ${bodyRow}
            <tr>
              <td class="button-cell" style="padding: 8px 32px 32px 32px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${linkAttr}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="25%" stroke="f" fillcolor="${VIOLET}">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:${FONT};font-size:16px;font-weight:bold;">${buttonLabel}</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <a class="button" href="${linkAttr}" style="display: inline-block; background-color: ${VIOLET}; color: #ffffff; font-family: ${FONT}; font-size: 16px; line-height: 20px; font-weight: bold; text-decoration: none; text-align: center; padding: 14px 28px; border-radius: 12px;">${buttonLabel}</a>
                <!--<![endif]-->
              </td>
            </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 8px 0 8px; font-family: ${FONT}; font-size: 13px; line-height: 20px; color: ${MUTED};">
              ${footerStart} <a href="${settingsAttr}" style="color: ${INK}; text-decoration: underline;">account settings</a>.
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
    view.title,
    ...(view.body ? ["", view.body] : []),
    "",
    `${buttonLabel}: ${link}`,
    "",
    `${footerStart} account settings: ${settingsLink}`,
    "",
  ].join("\n");

  return { subject, html, text };
}
