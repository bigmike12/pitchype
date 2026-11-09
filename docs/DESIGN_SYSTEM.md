# Pitchype design system

One system for every page: the landing page, sign-in, onboarding, the account
page, and everything built after them. It has three layers:

| Layer | Where | What |
|---|---|---|
| Tokens and utilities | `src/app/globals.css` | Colours, type, radii, page width, section rhythm, links, focus, motion |
| UI components | `src/components/ui/` | Button, form fields, choice pills, form messages, notices |
| Brand kit and shells | `src/components/brand/`, `src/components/shells/` | Wordmark, product fragments, stickers, illustrations; page layouts |

Use these before writing new styles. If a page needs something the system
doesn't have, add it here (and to the code) only once it's needed in two or
more places; otherwise style it locally.

## Colour

| Token (Tailwind class) | Value | Use |
|---|---|---|
| `canvas` | #FFFFFF | Page background everywhere (white since 2026-11-09; it was cream #FFF9EE) |
| `surface-soft` | #FBF3E2 | Bands (waitlist), footer, hero art background |
| `surface-card` | #F4EBD6 | Cream cards (steps, pricing, account summary) |
| `white` | #FFFFFF | Form fields, white panels (always outlined, since the page is white too) |
| `ink` | #121212 | Headings, primary buttons, text on saturated colours |
| `body` | #3A3A3A | Running text |
| `muted` | #666666 | Secondary text, hints, footer links (cream surfaces only) |
| `hairline` | #E8E0CC | Decorative 1px lines and white-panel outlines |
| `field` | #8A8273 | Borders of fields and pills (3:1 for WCAG 1.4.11) |
| `danger` | #B3261E | Error text and error borders |
| `brand-green` | #0F3D2E | Featured surfaces: auth panel, escrow sticker, success text |
| `brand-coral`, `brand-lilac`, `brand-sun`, `brand-peach`, `brand-mint` | see `globals.css` | Feature cards, shapes, pills, avatars |

Contrast rules (checked against WCAG AA):

- Ink text on coral, lilac, sun, peach and mint. White text only on ink and
  brand green (add the `on-dark` utility, which also turns links and focus
  rings white).
- `muted` only on cream and white, never on saturated colours.
- Coral is a fill, never a text colour.
- Text never sits on a shape of another colour (e.g. white on lilac fails).

## Type

- **Display:** Bricolage Grotesque 600, tight tracking. Utilities:
  `text-display-xl` (hero h1), `text-display-lg` (page and section headings
  on marketing pages, auth and onboarding headings), `text-display-page`
  (portal page titles and the home greeting, 28px on phones to 36px on
  desktop), `text-display-md` (card and sub-section titles, portal section
  headings).
- **Text:** Inter. `text-lg` for lead paragraphs, `text-base` for body,
  `text-sm` for hints, notes and footers, `text-xs` inside product fragments.
- Sentence case everywhere. No all-caps labels.

## Space and layout

- **Page width:** `container-page` (max 1280px; 16 / 24 / 32px gutters).
- **Section rhythm:** `section-y` (64px between sections on phones, 96px on
  desktop; margins collapse so gaps never double).
- **Form columns:** `max-w-sm` in the auth shell, `max-w-md` on the account
  page. Fields stack with `space-y-5`.
- 4px base grid (Tailwind's spacing scale).

## Shape and depth

| Radius | Class | For |
|---|---|---|
| 12px | `rounded-control` | Buttons, form fields |
| 16px | `rounded-card` | Product fragments, stickers, white panels, notices, cream cards |
| 24px | `rounded-panel` | Feature cards, bands, illustration panels |
| full | `rounded-full` | Choice pills, chips, badges, avatars |

`rounded-lg` (8px) is for small details inside fragments and nav links.

No drop shadows. Depth comes from colour: saturated and cream cards on the
white page, white panels outlined with `ring-1 ring-hairline`.

## Interaction

- **Focus:** a 2px ink outline, 3px offset, on every focusable element (white
  on dark surfaces). Never remove it.
- **Tap targets:** at least 44px (buttons are 44 or 48px; fields 48px).
- **Motion:** only under `motion-safe:` (button lift on hover, floating
  stickers). Nothing moves for people who ask for reduced motion.

## Components

| Component | File | Notes |
|---|---|---|
| `Button`, `buttonVariants` | `ui/button.tsx` | `default` (ink), `secondary` (white, outlined), `light` (on dark surfaces), `ghost`. Sizes `default` (44px), `lg` (48px), `icon`. Use `buttonVariants` to style links as buttons. |
| `TextField`, `SelectField`, `TextAreaField` | `ui/field.tsx` | Visible label, optional leading `icon` (not on text areas), `hint`, `error`, `labelAside` (e.g. "Forgot your password?"); `TextAreaField` also takes `optional`. |
| `PasswordField` | `ui/password-field.tsx` | Adds a Show button. |
| `ChoiceGroup` | `ui/choice-group.tsx` | One choice from 2–3 options, on real radio buttons. `variant="pills"` (compact, label only; the waitlist) or `variant="cards"` (stacked, with icon, tone and a one-line description; the sign-up account type). Controlled (`value` + `onValueChange`) or not (`defaultValue`). |
| `FormMessage` | `ui/form-message.tsx` | The form's overall result, just above the submit button. Always rendered (announces changes). |
| `Notice` | `ui/notice.tsx` | Replaces a form when it's done ("Check your email"). Takes focus. |
| `link` utility | `globals.css` | Inline text links. |
| `Wordmark`, `PitchypeMark` | `brand/wordmark.tsx` | Also used by the social image and app icon. |
| Product fragments | `brand/fragments.tsx` | `ProductFragment` (labelled as an image, "Sample" tag), `Avatar` (initials, never photos), `Chip`. Fictional data only. |
| Stickers | `brand/stickers.tsx` | `EscrowSticker` (`tone="light"` on dark backgrounds), `ApprovedBadge`, `clay()` shading for shapes. |
| `ClayTile` | `brand/stickers.tsx` | A rounded square in a brand colour (`Tone`: sun, lilac, mint, peach, coral) with `clay()` shading and an ink Lucide icon; `md` 36px, `lg` 44px. Our stand-in for 3D icons: onboarding steps, action cards, empty states. Decorative. |
| `PageHeader` | `ui/page-header.tsx` | The top of every portal page: optional breadcrumbs (ancestors only, each truncated), the `text-display-page` title with an optional `badge`, a lead, and `actions` (right from 640px, below on phones). |
| `Callout` | `ui/callout.tsx` | One style for every status message in the portal. Tones `info` (surface-soft), `attention` (sun), `success` (mint), `danger` (white, danger outline and icon). Icon, bold title, text, optional `action`. Quote an admin's note on its own line, so a note ending in a full stop doesn't get a second one. |
| `EmptyState` | `ui/empty-state.tsx` | What a list shows when it has nothing yet: large clay tile, title, one line, optional action. With no results, keep the results count for screen readers only (`sr-only`) so the message isn't repeated. |
| `ActionCard` | `ui/action-card.tsx` | A quick action: white outlined card, clay tile, title, one line; the whole card is one link. |
| `CampaignTable` | `campaigns/campaign-table.tsx` | A business's campaigns: a table from 640px (titles wrap), a stacked list on phones (titles truncate). |
| `NichePicker` | `creators/niche-picker.tsx` | Niche pills (checkboxes named `niches`), up to three; controlled. Profile editor and onboarding. |
| `Directory`, `DirectoryFilters`, `CreatorProfileView` | `creators/directory.tsx`, `creators/directory-filters.tsx`, `creators/creator-profile-view.tsx` | The creator directory and a profile, shared by the public pages (`basePath="/creators"`) and the business portal (`/business/creators`). |
| Illustrations | `landing/hero-illustration.tsx`, `brand/auth-scene.tsx` | Built from the fragments and stickers. Stickers sit only over empty areas. |
| `StatusPill`, `DeliverableList`, `RequirementList` | `campaigns/campaign-facts.tsx` | A campaign's status; what each creator posts and when; who can apply. Given a creator's `problems`, each requirement shows a tick or a cross (with words for screen readers). |
| `CreatorPhoto` | `creators/creator-photo.tsx` | A real creator's square photo (`rounded-card`), or their initials on a brand colour picked from their name. Decorative: the name is always beside it. Not `Avatar`, which is for fictional people. |
| `CreatorCard` | `creators/creator-card.tsx` | A directory card: photo, name (the link, stretched over the card), location, niche chips, platform summary, and the rate line for viewers who may see it. `href` is the profile page; `null` for a preview with no link. |
| `PlatformIcon` | `creators/platform-icon.tsx` | Line glyphs for Instagram, TikTok, YouTube and X in Lucide's style. Always next to the platform's name (visible or `sr-only`). |
| `PlatformSummary`, `PlatformDetails`, `VerifiedMark` | `creators/platform-list.tsx` | Followers as "10K–50K" or a verified count, labelled "Self-reported, updated …" or "Verified, as of …". `VerifiedMark` is the mint "Verified" pill. |
| Shells | `shells/auth-shell.tsx`, `shells/portal-shell.tsx` (+ `portal-nav.tsx`), `shells/onboarding-shell.tsx`, `app/(marketing)/layout.tsx` | See below. |

## Page patterns

- **Marketing pages:** site header and footer, sections using
  `container-page` + `section-y`, headings in `text-display-lg`.
- **Auth pages** (`AuthShell`): wordmark top left, a narrow form column
  centred vertically, `AuthHeading` (title plus one-line lead), the form,
  `AuthAlternative` ("New to Pitchype? Create an account"), Privacy and Terms at
  the bottom. On screens 1024px and wider, the green illustration panel fills
  the right half.
- **Onboarding** (`OnboardingShell`, `app/(onboarding)/`): white page, wordmark
  and Sign out at the top, one `max-w-lg` column, one question per screen.
  Each step (`OnboardingStep`) has a 3px progress bar along the top
  (`aria-hidden`), a clay tile, "Step N of M", a back link beside a
  `text-display-lg` question, a one-line lead, then an ink Continue (full
  width on phones) and "Finish later" where it applies.
- **Portal pages** (`PortalShell`, every page under `app/(portal)/`): the
  layout draws the shell once. From 1024px, a white 240px sidebar (wordmark,
  the role's links with the active one on `surface-soft`, the account and
  Sign out at the bottom) and a 64px top bar (section name, the role's main
  action, Help). Below 1024px, a top bar with a menu button that opens the
  same contents in a native `<dialog>`. The work area is white: pages start
  with `PageHeader`, keep reading and form pages to `max-w-3xl` and let
  tables and grids use the full width. Panels are white with
  `ring-1 ring-hairline`; tinted fills are only for callouts, pills, tiles
  and the active nav item. Status is a `Callout`, empty lists an
  `EmptyState`, quick actions `ActionCard`s, figures white outlined stat
  cards. Filter forms are a white outlined toolbar.
- **Directory pages:** the public pages use the marketing layout; the business
  portal has the same directory at `/business/creators`. Filters are a plain
  GET form (a `surface-soft` panel in public, a white toolbar in the portal),
  so every filtered view is a shareable URL. Cards in a 1/2/3/4-column grid.
  Signed-out visitors get one `brand-sun` prompt explaining what businesses
  see.
- **Forms:** one column, labels always visible (no placeholder-only fields),
  a full-width primary button, errors under the field they belong to, the
  overall result in `FormMessage`, and a `Notice` when the form is finished.
- **Forms that hold their own state** (inputs with `value`/`checked` from
  `useState`, such as the campaign form's deliverable lines or the niche
  pills) submit from `onSubmit` with `startTransition(() => formAction(data))`
  instead of only `action={formAction}`. React resets a form after its action
  runs, and controlled inputs would then show their first values while state
  holds the new ones, so the next save sends stale data. Plain uncontrolled
  forms can keep `action={formAction}`.

## Inspiration, not copying

The auth layout borrows the structure of Clay's sign-in pages: a split screen,
a narrow form column with the logo above it, and a product-led illustration
panel. Nothing else is taken: no Clay name, logo, copy, colours,
illustrations or typeface. The landing page's cream-and-saturated-cards
approach came from the design notes in `docs/design-inspiration-clay.md`,
under the same rule.
