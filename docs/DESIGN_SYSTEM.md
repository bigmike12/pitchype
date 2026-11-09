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
| `canvas` | #FFF9EE | Page background everywhere |
| `surface-soft` | #FBF3E2 | Bands (waitlist), footer, hero art background |
| `surface-card` | #F4EBD6 | Cream cards (steps, pricing, account summary) |
| `white` | #FFFFFF | Form fields, white panels, product fragments |
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
  `text-display-xl` (hero h1), `text-display-lg` (page and section headings,
  auth headings), `text-display-md` (card and sub-section titles).
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

No drop shadows. Depth comes from colour: saturated cards on cream, white
panels outlined with `ring-1 ring-hairline`.

## Interaction

- **Focus:** a 2px ink outline, 3px offset, on every focusable element (white
  on dark surfaces). Never remove it.
- **Tap targets:** at least 44px (buttons are 44 or 48px; fields 48px).
- **Motion:** only under `motion-safe:` (button lift on hover, floating
  stickers). Nothing moves for people who ask for reduced motion.

## Components

| Component | File | Notes |
|---|---|---|
| `Button`, `buttonVariants` | `ui/button.tsx` | `default` (ink), `secondary` (cream, outlined), `light` (on dark surfaces), `ghost`. Sizes `default` (44px), `lg` (48px), `icon`. Use `buttonVariants` to style links as buttons. |
| `TextField`, `SelectField` | `ui/field.tsx` | Visible label, optional leading `icon`, `hint`, `error`, `labelAside` (e.g. "Forgot your password?"). |
| `PasswordField` | `ui/password-field.tsx` | Adds a Show button. |
| `ChoiceGroup` | `ui/choice-group.tsx` | One choice from 2–3 options, on real radio buttons. `variant="pills"` (compact, label only; the waitlist) or `variant="cards"` (stacked, with icon, tone and a one-line description; the sign-up account type). Controlled (`value` + `onValueChange`) or not (`defaultValue`). |
| `FormMessage` | `ui/form-message.tsx` | The form's overall result, just above the submit button. Always rendered (announces changes). |
| `Notice` | `ui/notice.tsx` | Replaces a form when it's done ("Check your email"). Takes focus. |
| `link` utility | `globals.css` | Inline text links. |
| `Wordmark`, `PitchypeMark` | `brand/wordmark.tsx` | Also used by the social image and app icon. |
| Product fragments | `brand/fragments.tsx` | `ProductFragment` (labelled as an image, "Sample" tag), `Avatar` (initials, never photos), `Chip`. Fictional data only. |
| Stickers | `brand/stickers.tsx` | `EscrowSticker` (`tone="light"` on dark backgrounds), `ApprovedBadge`, `clay()` shading for shapes. |
| Illustrations | `landing/hero-illustration.tsx`, `brand/auth-scene.tsx` | Built from the fragments and stickers. Stickers sit only over empty areas. |
| `CreatorPhoto` | `creators/creator-photo.tsx` | A real creator's square photo (`rounded-card`), or their initials on a brand colour picked from their name. Decorative: the name is always beside it. Not `Avatar`, which is for fictional people. |
| `CreatorCard` | `creators/creator-card.tsx` | A directory card: photo, name (the link, stretched over the card), location, niche chips, platform summary, and the rate line for viewers who may see it. |
| `PlatformIcon` | `creators/platform-icon.tsx` | Line glyphs for Instagram, TikTok, YouTube and X in Lucide's style. Always next to the platform's name (visible or `sr-only`). |
| `PlatformSummary`, `PlatformDetails`, `VerifiedMark` | `creators/platform-list.tsx` | Followers as "10K–50K" or a verified count, labelled "Self-reported, updated …" or "Verified, as of …". `VerifiedMark` is the mint "Verified" pill. |
| Shells | `shells/auth-shell.tsx`, `shells/app-shell.tsx`, `app/(marketing)/layout.tsx` | See below. |

## Page patterns

- **Marketing pages:** site header and footer, sections using
  `container-page` + `section-y`, headings in `text-display-lg`.
- **Auth pages** (`AuthShell`): wordmark top left, a narrow form column
  centred vertically, `AuthHeading` (title plus one-line lead), the form,
  `AuthAlternative` ("New to Pitchype? Create an account"), Privacy and Terms at
  the bottom. On screens 1024px and wider, the green illustration panel fills
  the right half. Onboarding uses the same shell with a Sign out button.
- **Signed-in pages** (`AppShell`): header bar with wordmark and Sign out, a
  `max-w-2xl` content column, `text-display-lg` page title. The creator's
  profile editor and the admin page use it too, one `text-display-md` section
  per job (photo, about you, platforms).
- **Directory pages:** marketing layout. Filters are a plain GET form on a
  `surface-soft` panel, so every filtered view is a shareable URL and works
  without JavaScript. Cards in a 1/2/3/4-column grid. Signed-out visitors get
  one `brand-sun` prompt explaining what businesses see.
- **Forms:** one column, labels always visible (no placeholder-only fields),
  a full-width primary button, errors under the field they belong to, the
  overall result in `FormMessage`, and a `Notice` when the form is finished.

## Inspiration, not copying

The auth layout borrows the structure of Clay's sign-in pages: a split screen,
a narrow form column with the logo above it, and a product-led illustration
panel. Nothing else is taken: no Clay name, logo, copy, colours,
illustrations or typeface. The landing page's cream-and-saturated-cards
approach came from the design notes in `docs/design-inspiration-clay.md`,
under the same rule.
