// The text served at /llms.txt: a plain-text map of the public site for AI
// assistants and answer engines (the llmstxt.org format: a title, a one-line
// summary, then sections of links).
//
// It says nothing the site doesn't already say. The summary is
// SITE_DESCRIPTION and the questions are the home page's own FAQ, so a fee or
// escrow change shows up here with the page. Only public, indexable pages are
// listed (never the draft legal pages or anything behind a sign-in).

import { HOME_FAQ } from "./faq.ts";
import { BUSINESS_PAGE, CREATOR_PAGE } from "./signup-link.ts";
import {
  CONTACT_EMAIL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "./site.ts";

const PAGES: { label: string; path: string; about: string }[] = [
  {
    label: "Home",
    path: "/",
    about: "What Pitchype is, who it is for and how a job works.",
  },
  {
    label: "For businesses",
    path: BUSINESS_PAGE,
    about:
      "Hiring creators: campaigns, choosing creators and paying through escrow.",
  },
  {
    label: "For creators",
    path: CREATOR_PAGE,
    about: "Finding paid work, applying to campaigns and getting paid.",
  },
  {
    label: "How escrow works",
    path: "/how-escrow-works",
    about:
      "How a payment is held until the work is approved, the fees, and what happens when a job is cancelled or disputed.",
  },
  {
    label: "Find creators",
    path: "/creators",
    about:
      "The public creator directory. Follower counts are marked self-reported or verified.",
  },
  {
    label: "Contact",
    path: "/contact",
    about:
      "How to reach the Pitchype team: a contact form, email and social profiles.",
  },
];

export function buildLlmsTxt(): string {
  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Work starts in one of two ways: a business publishes a campaign and creators apply to it, or a business browses creators, chats and hires one directly. Either way the job is paid through escrow.",
    "",
    "## Pages",
    "",
    ...PAGES.map(
      ({ label, path, about }) => `- [${label}](${SITE_URL}${path}): ${about}`,
    ),
    "",
    "## Creator profiles",
    "",
    `Each listed creator has a public page at ${SITE_URL}/creators/{slug} with their name, location, niches, bio, platforms with follower ranges, and samples of their work. Handles, links to their social accounts and rates are shown only to signed-in businesses. Every public profile is in the [sitemap](${SITE_URL}/sitemap.xml).`,
    "",
    "## Frequently asked questions",
    "",
    ...HOME_FAQ.flatMap(({ question, answer }) => [
      `### ${question}`,
      "",
      answer,
      "",
    ]),
    "## Contact",
    "",
    `- Email: ${CONTACT_EMAIL}`,
    ...SOCIAL_PROFILES.map(({ label, url }) => `- ${label}: ${url}`),
  ];
  return `${lines.join("\n")}\n`;
}
