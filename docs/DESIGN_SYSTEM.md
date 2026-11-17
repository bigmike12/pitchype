# Pitchype design system

One system for every page: the landing page, sign-in, onboarding, the portal,
and everything built after them.

**The look ("porcelain and aurora", since 2026-11-10):** futuristic but calm.
A soft off-white page; white cards lifted by a hairline and a shadow you feel
more than see; ink for type and primary actions; soft aurora gradients (rose,
peach, lilac, sky, mint) with a fine grain for illustrated panels; one
saturated accent (violet) used sparingly; and motion that is smooth, short and
always optional. References: Passionfroot (split onboarding with an aurora
panel, the "why we ask" card) and Clay (sidebar app shell, quick-action cards
with 3D-style tiles). Borrow structure and feel only, never their names,
logos, copy, illustrations or typefaces.

It has three layers:

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
| `canvas` | #F8F8F6 | Porcelain page background everywhere; the portal sidebar sits on it |
| `surface` | #FFFFFF | Cards, panels, fields, the portal work area (`bg-white` is the same colour) |
| `surface-soft` | #F2F2EE | Hover fills, table heads, quiet boxes inside cards |
| `surface-card` | #EBEBE6 | Stronger quiet fill: draft/closed pills, progress tracks, sample tags |
| `ink` | #0E0E10 | Headings, primary buttons, text on pastel fills |
| `body` | #3B3B42 | Running text |
| `muted` | #63636B | Secondary text, hints (white, canvas and the two greys only) |
| `hairline` | #E6E6E1 | 1px lines and card outlines |
| `hairline-strong` | #D6D6D0 | Secondary-button outline, hovered card outline |
| `field` | #85858D | Borders of fields and pills (3:1 on white, canvas and surface-soft; WCAG 1.4.11) |
| `danger` | #B3261E | Error text and error borders |
| `brand-coral` | #FF6B57 | The mark. A fill, never a text colour |
| `brand-violet` | #5B3DF5 | The one saturated accent: active nav icon, progress, live dot, glows, the end of `text-gradient`. Text-safe on white (6.1:1) |
| `brand-green` | #0F3D2E | The escrow sticker and success text |
| `brand-lilac`, `brand-sun`, `brand-peach`, `brand-mint`, `brand-sky`, `brand-rose` | see `globals.css` | Pastel fills: pills, tiles, avatars, aurora stops |
| `attention`, `attention-ring` | #FFF1BF, #F3DC8C | The `attention` callout's tint and outline (warmer than `brand-sun`) |
| `ink-hover` | #26262B | Hover of the primary (ink) button |

Contrast rules (checked against WCAG AA):

- Ink or body text on every pastel. White text only on ink and brand green
  (add the `on-dark` utility, which also turns links and focus rings white).
- `muted` only on white, canvas, `surface-soft` and `surface-card`, never on
  a pastel or an aurora.
- `text-gradient` (coral to violet) only on display-size type; both ends pass
  3:1 on the canvas and the auroras.
- Text never sits on a shape of another colour.

## Type

- **Display:** Bricolage Grotesque 600, tight tracking (kept from the first
  design; it is the brand's voice). Utilities: `text-display-xl` (hero h1,
  40px to 84px), `text-display-lg` (section, auth and onboarding headings),
  `text-display-page` (portal page titles, 28px to 36px), `text-display-md`
  (card and sub-section titles).
- **Accent:** `text-gradient` on one or two words of a big heading ("gets
  paid."), at most once per screen.
- **Text:** Inter. `text-lg` for lead paragraphs, `text-base` for body,
  `text-sm` for hints, notes and footers, `text-xs` inside product fragments.
  `tabular-nums` for money in tables and receipts.
- Sentence case everywhere. No all-caps labels.

## Space and layout

- **Page width:** `container-page` (max 1280px; 16 / 24 / 32px gutters).
- **Section rhythm:** `section-y` (64px between sections on phones, 112px on
  desktop; margins collapse so gaps never double).
- **Form columns:** `max-w-sm` in the auth shell, `max-w-md` on the account
  page. Fields stack with `space-y-5`.
- 4px base grid (Tailwind's spacing scale).

## Shape and depth

| Radius | Class | For |
|---|---|---|
| 12px | `rounded-control` | Buttons, form fields |
| 16px | `rounded-card` | Cards, product fragments, stickers, callouts, notices |
| 24px | `rounded-panel` | Feature and pricing cards |
| 28px | `rounded-frame` | Big framed shells: the onboarding frame, the portal work panel, the auth art, the creator and business sections, the calculators, the closing band |
| full | `rounded-full` | Choice pills, chips, badges, avatars, the header's nav links |

`rounded-lg`/`rounded-xl` (8–12px) are for small details inside fragments and
nav links.

Depth is a hairline plus a soft shadow, never a heavy drop:

| Utility | What it is | For |
|---|---|---|
| `panel` | White, 1px hairline ring, `shadow-card` | The default card. Replaces `bg-white ring-1 ring-hairline` |
| `shadow-card` | Barely-there shadow | Buttons, pills, chips |
| `shadow-lift` | Softer, deeper | Hover state of linked cards, open FAQ items |
| `shadow-pop` | Floating | Stickers, toasts, the drawer, the hero window, cards on an aurora |
| `shadow-button` | Lit top edge and drop | The ink button only |
| `glass` | 72% white, 16px blur | Things that float over content: the landing header, portal top bar, cards on an aurora |

Surfaces with colour:

- `aurora` (rose and sky) and `aurora-warm` (peach and lilac): soft colour
  fields with a fine grain. The hero, the auth panel, onboarding's "why we
  ask" panel (alternating per step), the creator and business sections, the
  closing band. Add `motion-safe:animate-aurora` for a slow drift.
- `dot-grid`: a faint dot pattern that fades towards the edges; behind the
  hero and the closing band.
- `beam`: a thin violet-to-coral light that travels round a card's edge. The
  hero window only; one per page at most.

## Interaction

- **Focus:** a 2px ink outline, 3px offset, on every focusable element (white
  on dark surfaces). Never remove it. Fields add a faint violet glow on focus.
- **Tap targets:** at least 44px (buttons are 44 or 48px; fields 48px).
- **Hover:** buttons rise 1px and press to 98% on click; linked cards rise
  1px and move to `shadow-lift`; nav links get a 4% ink wash.
- **Triangle pointer (marketing pages only):** the marketing layout adds
  `triangle-cursor`, which swaps the hand cursor on links, buttons, tabs,
  FAQ questions and choice pills for a small coral-to-violet triangle (ink
  while pressed). Plain CSS at the end of `globals.css`, so it beats
  `cursor-pointer`. Text fields keep the text cursor; the portal keeps the
  normal hand.
- **Loading:** every portal and onboarding page's Suspense fallback is a
  skeleton of that page in `PageLoading` (one "Loading…" message for screen
  readers, fading in after 120ms so quick loads don't flash). The sidebar
  and top bar have their own skeletons, and a nav link shows a violet dot
  while its page is on the way. `loading.tsx` in `(portal)` and
  `(onboarding)` is a generic safety net.

## Motion

CSS only (no animation library): keyframes and utilities live in
`globals.css`. Everything moves only under `prefers-reduced-motion:
no-preference`; with reduced motion the page is complete and still.

| Utility | What it does | Where |
|---|---|---|
| `enter` | Rise 8px, fade in, a touch of focus (0.7s, ease-out-expo). Stagger 50–60ms with `style={{ "--delay": "60ms" }}` | Hero lines, auth and onboarding content, the portal's `<main>` |
| `reveal` | The same, driven by scroll position (`animation-timeline: view()`). Browsers without scroll-driven animations just show the content | Landing headings, cards, list items |
| `motion-safe:animate-aurora` | Very slow drift (40s) of the aurora's colour fields | Hero, auth panel, closing band |
| `motion-safe:animate-marquee` | Endless, slow (90s) horizontal scroll; pause on hover; with reduced motion the row wraps instead | The niches and kinds-of-work rows |
| `motion-safe:animate-float` | A 4px bob with a tilt (9s) | Stickers |
| `motion-safe:animate-pulse-dot` | A violet ring pulsing out | The "Early access" dot |
| `beam` | A faint light round a card's edge (14s a lap) | Hero window |
| `animate-[fade-up_…]`, `animate-[drawer-in_…]` | One-off entrances | Tab panels, FAQ answers, the toast, the portal drawer |

| `skeleton` | A soft light sweeping across a grey block (1.8s) | Loading placeholders (`ui/skeleton.tsx`) |

Keep it subtle (the 2026-11-10 tune-down): entrances move 8px at most and
blur 2px at most; hovers lift 1px; ambient loops take 9s or longer and stay
faint. Rules: durations 0.3–0.7s for entrances, 9s+ for ambient loops; ease
`var(--ease-out-expo)`; animate `transform`, `opacity` and `filter` only;
never animate layout; never hide information behind an animation; nothing
loops faster than every few seconds. If a later need (gestures, shared
layout transitions) can't be met with CSS, the candidate is `motion`; name
the need before adding it (CLAUDE.md §2).

## Components

| Component | File | Notes |
|---|---|---|
| `Button`, `buttonVariants` | `ui/button.tsx` | shadcn/ui's Button, restyled. `default` (ink, `shadow-button`), `secondary` (white, `hairline-strong` outline, `shadow-card`), `light` (on dark surfaces), `ghost` (4% ink wash). Sizes `default` (44px), `lg` (48px), `icon`, and `sm` (44px on touch screens, 36px from 1024px: for buttons inside rows and the top bar). Use `buttonVariants` to style links as buttons. |
| `TextField`, `SelectField`, `TextAreaField` | `ui/field.tsx` | Visible label, optional leading `icon` (not on text areas), `hint`, `error`, `labelAside` (e.g. "Forgot your password?"); `TextAreaField` also takes `optional`. `SelectField` takes `compact` (44px control, `text-sm` label) for filter toolbars. |
| `FilterBar`, `filterHref` | `ui/filter-bar.tsx` | The toolbar above a list (campaigns, creators, the admin ledger; also the public directory): one slim `panel` (12–16px padding), the fields in a row with the submit button (`size="sm"`, filters icon) at the row's end from 1024px and full width under the fields below it. Filters that are on show under a hairline as chips (`surface-soft`, each a link that drops just that filter) with "Clear all" at the right; with none on, there is no second row. A plain GET form: works without JavaScript and every filtered view is a URL. Fields inside it take `compact` (13px muted label; 44px control on touch, 36px from 1024px). |
| `PasswordField` | `ui/password-field.tsx` | Adds a Show button. |
| `ChoiceGroup` | `ui/choice-group.tsx` | One choice from 2–3 options, on real radio buttons. `variant="pills"` (compact, label only; not used at the moment) or `variant="cards"` (stacked, with icon, tone and a one-line description; the sign-up account type). Controlled (`value` + `onValueChange`) or not (`defaultValue`). |
| `FormMessage` | `ui/form-message.tsx` | The form's overall result, just above the submit button. Always rendered (announces changes). |
| `Notice` | `ui/notice.tsx` | Replaces a form when it's done ("Check your email"). Takes focus. |
| `link` utility | `globals.css` | Inline text links. |
| `Wordmark`, `PitchypeMark` | `brand/wordmark.tsx` | Also used by the social image and app icon. |
| Product fragments | `brand/fragments.tsx` | `ProductFragment` (labelled as an image, "Sample" tag), `Avatar` (initials, never photos), `Chip`. Fictional data only. |
| Stickers | `brand/stickers.tsx` | `EscrowSticker` (`tone="light"` on dark backgrounds), `ApprovedBadge`, `clay()` shading for shapes. |
| `ClayTile` | `brand/stickers.tsx` | A glossy rounded square in a pastel (`Tone`: sun, lilac, mint, peach, coral, sky, rose): `clay()` gradient, lit top edge, soft drop, an ink Lucide icon; `md` 36px, `lg` 48px. Our stand-in for 3D icons: onboarding's why-card, action cards, empty states, the creators band. Decorative. |
| `PageHeader` | `ui/page-header.tsx` | The top of every portal page: optional breadcrumbs (ancestors only, each truncated), the `text-display-page` title with an optional `badge`, a 15px muted lead, and `actions` (right from 640px, below on phones). |
| `Popover` | `ui/popover.tsx` | shadcn/ui's popover (Radix), restyled: a white card floating over the page (hairline and `shadow-pop`, `rounded-card`), aligned to the end of its trigger, kept 16px from the screen edges. Focus the panel itself on open (`onOpenAutoFocus`), so a mouse click doesn't ring the first button. Used by the notifications bell. |
| `Callout` | `ui/callout.tsx` | One style for every status message in the portal. Tones `info` (a `panel`), `attention` (pale butter with a sun outline), `success` (mint), `danger` (white, danger outline and icon). Icon, bold title, text, optional `action`. Quote an admin's note on its own line, so a note ending in a full stop doesn't get a second one. |
| `Skeleton` and friends | `ui/skeleton.tsx` | shadcn/ui's Skeleton, restyled (`skeleton` utility). `PageLoading` (the fallback wrapper with its screen-reader label), `HeaderSkeleton` (crumbs, action), `SectionTitleSkeleton`, `PanelSkeleton`, `FormSkeleton`, `FiltersSkeleton`, `CardGridSkeleton` (`action`, `creator`, `campaign`), `TableSkeleton` (like `CampaignTable`). Compose them to match the page's real layout so nothing jumps when it arrives. `OnboardingStepSkeleton` (in `onboarding-step.tsx`), `SidebarSkeleton` and `TopBarSkeleton` (in `portal-shell.tsx`). |
| `BoardToolbar` | `board/board-toolbar.tsx` | The search and filters above a Kanban board (the hiring board, "Your work"): a `FilterBar` holding Search, an optional Campaign select, and the people stack (the first 8 avatars, then a "+N" chip; tap one to narrow the board to them), with active filters as chips and "Clear all". A GET form, so every filtered board is a URL (`q`, `who`, `campaign`, `col`); the page filters the cards on the server with `matchesBoardFilter`. |
| `Tooltip` | `ui/tooltip.tsx` | shadcn/ui's tooltip, restyled: a small ink label with white text, opened by hover and keyboard focus, kept inside the window by Radix. Used for the people stack's names. Touch screens don't hover, so a tooltip never carries information that isn't also in the page's text. |
| `EmptyState` | `ui/empty-state.tsx` | What a list shows when it has nothing yet: large clay tile, title, one line, optional action. With no results, keep the results count for screen readers only (`sr-only`) so the message isn't repeated. |
| `ActionCard` | `ui/action-card.tsx` | A quick action (Clay-style): a `panel` with a large clay tile, title and one line; the whole card is one link. Lifts on hover; a small round arrow chip in the corner turns ink on hover. |
| `TABLE` | `ui/table.ts` | Class names for the one table look, so each table keeps plain markup: `frame` (white `panel`, clipped), `head` (`surface-soft/60`), `th` (40px tall, 11px semibold capitals, 0.06em tracking, muted), `body`, `row` (hover wash), `td` (16px sides, 20px at the row's ends, 12px top and bottom), and `list`/`listRow` for the stacked list a table becomes under 640px. Every table uses these; don't restyle one table on its own. |
| `Pagination` | `ui/pagination.tsx` | The pager for every list: "49–72 of 222 campaigns" at the left; Previous, numbered pages (first, last, the current one and its neighbours, "…" for gaps) and Next at the right. The current page is an ink square; steps are 44px on touch, 36px from 1024px; Previous/Next show only their arrows on phones. Links only (`hrefFor`), so every page is a URL. With one page it shows just the count; with nothing, nothing. `framed` puts it in the foot of a table or `SectionCard` (`surface-soft/60` strip); without it, it stands 24px under a card grid. Page maths is in `lib/paging.ts` (`parsePage`, `pageOf`, `pageWindow`, `pagedHref`). |
| `FilterTabs` | `ui/filter-tabs.tsx` | A segmented row of links that narrows a list to one group, each with its count ("Live 1"): a `surface-soft` track, the current tab a white pill with a lilac count. Used on a business's campaign list (All, Live, Drafts, Ended), the applicants page, admin reports and admin payouts. Scrolls sideways on phones. Use it for a handful of fixed groups; use `FilterBar` for fields. |
| `CreatorCard` | `creators/creator-card.tsx` | One creator in the directory (public and portal). A 4:3 photo inset 8px with a white "Verified" pill over its corner when any account is verified; name (16px semibold, one line), place, up to two niche chips and "+n"; then a `surface-soft/60` footer strip with the platforms (`PlatformSummary`) and, for viewers who may see it, the rate at the right ("From ₦10,000" or "Rate Negotiable"). The name link stretches over the card. |
| `CampaignCard` | `app/(portal)/(influencer)/campaigns/campaign-card.tsx` | One open campaign for a creator. Header: a tinted initial tile for the business (colour fixed per name), its name and place, and the mint "You qualify" pill. Title (16px semibold, two lines at most), what to post as chips with the platform icon, and the first reason when they don't qualify. Footer strip: pay in display type with "You receive …" under it, closing date and places at the right. |
| Search field | `ui/field.tsx` (`TextField compact type="search" icon={Search}`) | The first field in a `FilterBar`, name `q`, wider than the selects. Words are trimmed and capped at 60 characters (`lib/search.ts`) and show as a "Search" chip. Creators: name, city, state, niche names. Campaigns: title, brief, business name. Matching is in the database (`search_pattern`, migration `20261116100000`). |
| `QueueCard` | `app/(portal)/(admin)/admin/queue.tsx` | One admin queue: a `SectionCard` with the count as a pill, an optional one-line note, hairline-divided rows and a framed pager (10 a page). |
| `CampaignTable` | `campaigns/campaign-table.tsx` | A business's campaigns, in the shared table look (`TABLE`, below): a table from 640px, a stacked list on phones; the title is the link and the whole row follows it. `footer` takes a `<Pagination framed />`. |
| `LedgerTable` | `money/ledger-table.tsx` | A person's wallet history (the business and creator wallets). Takes ledger rows as stored and words them with `describeLedgerRow` (`lib/ledger-words.ts`): date, what happened, and the amount with a green `+` or ink `−` sign in `tabular-nums`. Same pattern as `CampaignTable`: a table from 640px, a stacked list on phones. Show `EmptyState` instead when there are no rows. |
| `AdminLedgerTable` | `money/admin-ledger-table.tsx` | The whole ledger for admins, one line per row: time, event (with who and why), raw account name, owner, a link to the hire's money trail and the amount **as stored** (wallets, escrow and revenue are negative when money is owed or earned), with `+`/`−` and screen-reader words. Table from 640px, stacked list on phones. Admin pages only. |
| `NichePicker` | `creators/niche-picker.tsx` | Niche pills (checkboxes named `niches`), up to three; controlled. Profile editor and onboarding. |
| `Directory`, `DirectoryFilters`, `CreatorProfileView` | `creators/directory.tsx`, `creators/directory-filters.tsx`, `creators/creator-profile-view.tsx` | The creator directory and a profile, shared by the public pages (`basePath="/creators"`) and the business portal (`/business/creators`). |
| Illustrations | `landing/hero-illustration.tsx`, `brand/auth-scene.tsx` | Built from the fragments and stickers. Stickers sit only over empty areas. |
| `Rounds`, `ProofFields` | `engagement/rounds.tsx`, `engagement/proof-fields.tsx` | `Rounds` lists a job's submitted rounds as hairline-divided rows for a `SectionCard`: "Round 2 · Sent back" and the date, links (new tab, `nofollow`), 96px screenshot thumbnails from signed URLs, the note, and for a sent-back round a `surface-soft` box of reasons. `ProofFields` (client) is the links textarea and a multiple screenshot input shared by every proof form; `formDataWithShrunkScreenshots` shrinks pictures to 2,000px JPEG in the browser before upload; the links box is capped at ~5,000 characters and `onScreenshotsChange` lets a form clear a "too big together" message when the choice changes. |
| `DisputeForm` | `engagement/dispute-form.tsx` | The "Open a dispute" disclosure shared by both sides: a reason (20 to 2,000 characters) plus `ProofFields`. The page passes its own Server Action (`action`, which calls `openDisputeFromForm` in `lib/open-dispute.ts`) and the `intro` sentence that says what the dispute is about. |
| `ProofLinks`, `ProofShots` | `engagement/proof-list.tsx` | The links and screenshots on a round or a dispute statement, shared by `Rounds` and `DisputeThread`; same rules (new tab, `nofollow`, 96px thumbnails from signed URLs; `label` starts each picture's alt text). |
| `DisputeThread` | `engagement/dispute-thread.tsx` | One dispute for the creator, the business and admins: a `Callout` (how it stands, with the expectations sentence, or how it ended, worded by `describeDisputeEnd` in `lib/dispute-words.ts`), "What the job was" (terms and brief), "The work sent in" (`Rounds`), then "Statements" oldest first with "Creator" / "Business" / "Pitchype" labels and, while open, the add-a-statement form (`StatementForm`, client) and, for the opener only, `WithdrawDisputeForm` (client disclosure). Each page passes its own role's Server Actions. `DisputeSkeleton` is its loading state. The admin page adds a `SectionCard` with the decision form (`admin/disputes/decide-form.tsx`, same preview as the escrow `SettleForm`, both through `describeSettlePreview`). |
| `StatusPill`, `DeliverableList`, `RequirementList` | `campaigns/campaign-facts.tsx` | A campaign's status; what each creator posts and when; who can apply. Given a creator's `problems`, each requirement shows a tick or a cross (with words for screen readers). |
| `CreatorPhoto` | `creators/creator-photo.tsx` | A real creator's square photo (`rounded-card`), or their initials on a brand colour picked from their name. Decorative: the name is always beside it. Not `Avatar`, which is for fictional people. |
| `PlatformIcon` | `creators/platform-icon.tsx` | Line glyphs for Instagram, TikTok, YouTube and X in Lucide's style. Always next to the platform's name (visible or `sr-only`). |
| `PlatformSummary`, `PlatformDetails`, `VerifiedMark` | `creators/platform-list.tsx` | Followers as "10K–50K" or a verified count, labelled "Self-reported, updated …" or "Verified, as of …". `VerifiedMark` is the mint "Verified" pill; on cards (`PlatformSummary`) a verified platform gets a solid `brand-coral` seal with a white tick. |
| `SectionCard` | `ui/section-card.tsx` | A titled card: a 48px header strip (15px semibold title, then `aside` on the right for a count pill, a status pill or a link) over content that runs edge to edge. Lists inside it are `divide-y divide-hairline` rows with `px-4 sm:px-5`; never put another card inside one. `padded` pads the content for forms and prose; `anchor` puts an id on the section for jump links. Used by "Needs you", "Your profile", the hiring pipeline, and the sections of the wallet, account and profile pages. |
| `StatCard`, `TILE_TONES` | `ui/stat-card.tsx` | One figure about the account: a flat 32px pastel icon tile and a 13px muted label, the figure in display type (28px, `tabular-nums`), and one muted line saying what it means. `href` makes the whole card a link that lifts on hover. `emphasis` turns it into the page's one ink card (white text), for the money someone can act on; use it at most once per page. Real figures only: no trend arrows, percentages or sparklines until there is stored history to draw them from (CLAUDE.md §3). `TILE_TONES` maps a `Tone` to its flat fill class, for small icon tiles elsewhere. |
| `TaskList`, `Task` | `(portal)/home/task-list.tsx` | "Needs you": a `SectionCard` listing the specific next steps waiting on this person, most urgent first. Each row is an icon tile, a bold title, one muted line and one `sm` button (ink for the first thing to do, `secondary` for the rest). The header shows the count in a lilac pill. With nothing to do it says "Nothing is waiting on you right now." Tasks are built from real records in the home page, never invented. |
| `HomeGreeting` | `(portal)/home/task-list.tsx` | The top of a home page: "Hi Ada" in `text-display-page`, one muted line worded from what is actually waiting, and the page's buttons on the right (below on phones). |
| Hiring pipeline | `(portal)/home/business-home.tsx` (`Step`) | A `SectionCard` with four stages side by side (two by two on phones): To review, To pay, In progress, Completed. Each is a coloured dot and label, a display-type count and one line. To review and To pay link to where the work is when their count is above zero. Counts come from `hirePipeline` in `lib/home.ts`, which reads `listMyHires` (`lib/db/applications.ts`). |
| `Board`, `BoardColumn`, `BoardCard`, `BoardTabs` | `ui/board.tsx` (client), column rules in `lib/board.ts` | The Kanban board. Columns are `canvas` wells with an inset hairline (a coloured dot, 13px title, count pill and a one-line hint), side by side from 1024px in a row that scrolls sideways if it must; below 1024px one column shows at a time, chosen with `BoardTabs` (links carrying `?col=`, so it works without JavaScript). Cards are white `panel`s on `rounded-xl` with `sm` buttons. **Dragging has no rules of its own:** a card may hold elements marked `data-drop-action="<column key>"` (a button, a submit button or a link); it can be dropped on exactly those columns, and dropping clicks that element. So a drag does what the visible button does, with the same confirmation and server checks, and a card changes column only when the page returns with the new state. Never add a drop that skips a confirmation or moves money by itself. Droppable columns get a violet ring while a card is held and a lilac wash under it; draggable cards show a grip icon and a grab cursor from 1024px. Buttons stay for keyboards and touch screens (native drag and drop doesn't run there). An empty column says "Nothing here". `BoardSkeleton` (in `ui/skeleton.tsx`) is the loading shape. |
| Home pages | `(portal)/home/` | See "Home pages" under Page patterns. |
| Portal nav | `shells/portal-nav.tsx`, `lib/portal.ts` | Links sit under small uppercase captions (`group` on each `NavItem`; `navGroups` groups them): Work / Money / You for creators (Home, Campaigns, Your work, Inbox; Wallet; Your profile), Hiring / Money for businesses (Home, Hiring board, Campaigns, Find creators, Inbox; Wallet). Rows are 38px from 1024px and 44px in the phone drawer. Active: a white `panel` pill, ink semibold text, violet icon. Hover: ink at 4%. Unread counts are a 20px ink pill. Above the account card sits `EscrowNote`, a lilac-to-sky tinted card saying what escrow means for that role (none for admins). The account card shows the name and the role. The sidebar ends with Help, Terms and Privacy in `text-xs` muted; the phone drawer has "Help: email us" above the account block. |
| Shells | `shells/auth-shell.tsx`, `shells/portal-shell.tsx` (+ `portal-nav.tsx`), `shells/onboarding-shell.tsx`, `app/(marketing)/layout.tsx` | See below. |

## Page patterns

- **Marketing pages:** a floating glass header (a rounded bar 8–12px from
  the top), sections using `container-page` + `section-y`, headings in
  `text-display-lg` with `reveal`, cards as `panel`s. The landing page runs:
  hero (centred copy on a drifting aurora with a dot grid, sign-up buttons
  that preselect the account type, then the product window), the niches
  marquee and "Built for micro and nano creators", "Why Pitchype" (a
  usual-way-against-Pitchype table: rows on phones, three columns from
  768px), For creators (`aurora-warm` frame: pitch, ticks, the earnings
  calculator, then four sourced figures) and For businesses (`aurora`,
  mirrored, with the budget splitter), How it works (segmented tabs), a
  bento of features, pricing receipts, FAQ (one `panel` per question), the
  closing aurora band (join as a business or a creator, or log in), and the
  footer signing off with the name in giant faded type. The header holds
  Log in and Get started; its links collapse into the menu below 1024px.
- **Figures from outside sources** (`landing/stats.tsx`, `StatGrid`): big
  number, one sentence, and a "Source:" link under each, plus a line saying
  they're global or US figures. Every number needs a public source and the
  date it was checked; never add one without (CLAUDE.md §3).
- **Calculators** (`landing/earnings-calculator.tsx`,
  `landing/budget-splitter.tsx`): a white card on the aurora, labelled
  `Slider`s (`landing/slider.tsx`, styled by `.range` in `globals.css`), the
  result in a `surface-soft` list announced with `aria-live`, and a line
  saying it's an example, not a promise. Fee maths comes from `lib/fees.ts`
  (`feeExample`, `pricePerCreatorWithin`), never re-implemented.
- **Auth pages** (`AuthShell`): wordmark top left, a narrow form column
  centred vertically (it enters with `enter`), `AuthHeading` (title plus
  one-line lead), the form, `AuthAlternative` ("New to Pitchype? Create an
  account"), Privacy and Terms at the bottom. On screens 1024px and wider, the
  aurora illustration panel (`rounded-frame`) fills the right half.
- **Onboarding** (`OnboardingShell`, `app/(onboarding)/`): the canvas, the
  wordmark centred (from 640px) and Sign out at the top, one question per
  screen in a framed card (`rounded-frame panel`, up to `max-w-6xl`). Each
  step (`OnboardingStep`) is a split: the question column (segmented progress
  and "Step N of M", a back link beside a `text-display-lg` question, a
  one-line lead, the field, an ink Continue and "Finish later") and an aurora
  panel holding the "why we ask" card (clay tile, title, two lines; copy in
  `steps.ts`, `why`). The panel is on the left from 1024px and after the
  question on phones, and alternates cool and warm aurora per step. The done
  step can pass `showcase` (the creator's directory card) to fill the panel
  instead. A 3px coral-to-violet progress bar runs along the top of the page
  (`aria-hidden`).
- **Portal pages** (`PortalShell`, every page under `app/(portal)/`): the
  layout draws the shell once. Since 2026-11-16 the portal follows a modern
  dashboard-kit look (structure borrowed from HeroUI Pro's dashboards; none
  of its code, and no new dependencies), on our own tokens. From 1024px, a
  248px sidebar on the canvas (wordmark; the role's links under captions,
  the active one a white `panel` pill with a violet icon; the escrow note;
  the account card) and the work area as one white panel inset 8px
  (`rounded-frame`, hairline, `overflow-clip` so the sticky glass top bar
  keeps working). The 60px top bar holds the section name on the left and,
  on the right, the role's main action (`sm` button, not on `/home`), a
  creator's wallet balance as an outlined chip, and the bell. Below 1024px,
  the work area is the whole white page under a 56px glass top bar whose
  menu button opens the same sidebar contents in a native `<dialog>` that
  slides in from the left. Density: controls inside the shell and inside
  rows are 36–38px from 1024px and at least 44px on touch screens. Pages
  start with `PageHeader`, keep reading and form pages to `max-w-3xl` and
  let tables and grids use the full width. Cards are `panel`s on
  `rounded-card`, 12px apart in a grid; a card with a title is a
  `SectionCard`; figures are `StatCard`s. Tinted fills are only for
  callouts, pills, icon tiles and quiet boxes. Status is a `Callout`, empty
  lists an `EmptyState`, quick actions `ActionCard`s. Filter forms are a
  `FilterBar`.
- **Home pages** (`/home`, rebuilt 2026-11-16): `HomeGreeting`, any
  `Callout`s, then cards built only from the person's own records.
  **Creator:** four `StatCard`s (wallet balance as the ink `emphasis` card,
  earned in total after our fee, applications waiting, campaigns they
  qualify for; two across on phones, four from 1280px), the "Get listed"
  checklist while they aren't in the directory, then "Needs you" beside
  "Your profile" (photo, city, niches, starting rate, a Listed pill, and a
  row per platform with its verified count or self-reported range), then
  three campaign cards. **Business:** the hiring pipeline (To review links to the hiring board), then "Needs you"
  beside two `StatCard`s (wallet, live campaigns), then the recent
  campaigns table. The greeting row holds the page's main buttons (one for
  creators; "Find creators" and "Post a campaign" for businesses), and each
  task carries its own button, so the older "one action per home page" rule
  no longer applies. Home pages show no charts, trends or comparisons: we
  have no stored history, and we never show invented figures.
- **Boards** (added 2026-11-16): the two places people manage work in
  flight. Which column a card sits in is decided in `lib/board.ts` from what
  has really happened, with tests; cards outside every column (passed,
  withdrawn, lapsed, cancelled, refunded) sit in a "Closed" `<details>` list
  under the board.
  **Business, `/business/board` ("Hiring board"):** one card per creator.
  Columns Applied → Shortlisted → To pay → In progress → Completed, with
  campaign filter pills above ("All campaigns" reads the 12 most recently
  changed campaigns that have applications). Cards: Applied and Shortlisted
  show platforms, the asked price against the campaign's, Hire (the same
  fee-confirmation dialog as the applicants page), Shortlist or Message, and
  a link to the campaign's applicants page for the note, passing and
  blocking; To pay shows the deadline and Pay; In progress and Completed
  link to the hire. Drags: Applied → Shortlisted (shortlists), and Applied or
  Shortlisted → To pay (opens the Hire dialog). A hire that ended unpaid is
  back in Applied with "Hire again". The per-campaign applicants page
  (`/business/campaigns/[id]/applications`) stays as the detailed view.
  **Creator, `/applications` ("Your work" in the nav; the route is
  unchanged):** one card per campaign applied to. Columns Applied → Hired →
  Ready to start → In progress → Paid. Paid shows what reached the wallet
  after our fee. The one drag is Ready to start → In progress, which opens
  the job page where starting work is confirmed.
  Columns for submitted and reviewed work arrive with Stage 7.
- **Detail pages** (a campaign for its business or for a creator, a hire,
  a job; reworked 2026-11-16): two columns from 1280px, one below. The wide
  column holds the content as `SectionCard`s (what's posted, who can apply,
  the brief; or the status `Callout` and the "What's happened" timeline);
  the 22rem column holds the facts and the action (figures, the receipt, a
  creator's Apply form) and stays in view (`xl:sticky`). On phones the facts
  and the action come first on campaign pages, and the receipt sits between
  the status and the timeline on hire and job pages. Page wrapper
  `max-w-6xl` (campaigns) or `max-w-5xl` (hire, job).
- **The pay page stays a narrow single column** (`max-w-2xl`): it is a
  checkout, and nothing sits beside the amount.
- **Long forms** (the campaign form): one `padded` `SectionCard` per part,
  12px apart, at `max-w-3xl`. Boxes inside a card (a deliverable row, a
  checkbox row, a summary) are `bg-canvas ring-1 ring-hairline` wells, never
  a second `panel`.
- **Wallet pages** (`/wallet`, `/business/wallet`): the balance is the
  page's one `emphasis` `StatCard`, then `SectionCard`s 12px apart (a
  creator's "How it adds up" statement, Bank account, Ask for a payout, Your
  payouts), then History as a `LedgerTable`.
- **Long forms** also covers the live-campaign edit form ("Wording", then
  "Places and dates").
- **Settings-style pages** (`/account`, `/account/standing`, `/profile`):
  one `SectionCard` per part, stacked (`padded` for forms, unpadded for
  lists such as strikes).
- **Conversation** (`/inbox/[id]`): one `panel` card at `max-w-3xl`: the
  messages, then the composer on a `bg-canvas` footer strip under a
  hairline. Your messages are ink bubbles on the right; theirs are
  `bg-surface-soft` on the left (not a `panel`: no card inside a card).
  Bubbles are at most 85% wide on a phone, 70% from `sm`.
- **Admin pages.** One page per job, each in the sidebar. Review:
  `/admin` (overview: one `StatCard` per queue, each a link; nothing is
  decided there), `/admin/standing`, `/admin/campaigns`,
  `/admin/verification`, `/admin/reports` (creators and campaigns as
  `FilterTabs`), `/admin/hidden`. Money: `/admin/money` (the reconciliation
  callout and four `StatCard` links), `/admin/money/escrow`,
  `/admin/money/payouts` (waiting and decided as `FilterTabs`),
  `/admin/money/ledger`, `/admin/money/reconciliation`. A queue page is a
  `PageHeader` and one `QueueCard` per list; items are rows with no frame of
  their own; an empty queue is one muted line.
- **Lists are paged.** Every list ends in a `Pagination`: card grids
  (campaigns 24, creators), tables (a business's campaigns 10, wallet
  history 15, the admin ledger 50, reconciliation checks 15), row lists
  (inbox 20, applicants 10, a creator's payouts 5, admin queues 10). A page
  with two lists gives the second its own search param. The boards are not
  paged: a column is a stage, and "Completed" and "Closed" are already
  capped or folded away.
- **One main action.** The top bar already carries a role's main action
  ("New campaign", "Find campaigns"), so a list page does not repeat it in
  its page header; it appears in the page only inside an empty state.
- **Directory pages:** the public pages use the marketing layout; the business
  portal has the same directory at `/business/creators`. Filters are a `FilterBar`
  (a plain GET form, the same white `panel` toolbar in public and in the
  portal), so every filtered view is a shareable URL. Cards in a 1/2/3/4-column grid. Cards (creator, campaign) keep their footer facts below a hairline, so prices and platforms line up across a row; a creator's photo is 5:4.
  Signed-out visitors get one `brand-sun` prompt explaining what businesses
  see.
- **Applications** (Stage 5): a creator's campaign page ends with the apply
  form (price and note) or, once applied, a panel with the status, a
  `<details>` to change price or note, and Withdraw. `/applications` lists
  them as `panel` rows with a status pill. The business's applicants page
  (`/business/campaigns/[id]/applications`) has pill tabs (To decide,
  Hired, Passed or withdrawn) over one `panel` card per creator: profile
  facts, "Asks ₦X · your price ₦Y", the note, then actions in one row
  (Hire, Shortlist, Message, Block; "Pass on this creator" in a
  `<details>`). Hire opens a native `<dialog>` showing price, fee and total
  before confirming. The pay page is a receipt `panel`, then an `attention`
  "Pay within 48 hours" callout and the non-refundable fee callout, then the
  pay button and "Cancel this hire" in a `<details>`.
- **Inbox** (`/inbox`, `/inbox/[id]`): the list is one `panel` of threads
  with an unread pill; the Inbox nav item shows the unread count. A thread
  is bubbles (own messages ink on the right, theirs white `panel` on the
  left, time under each), then the composer: a textarea, a one-line reminder
  to keep contact details out, and Send. A held-back message shows as a
  danger `Callout` above the composer with the sender's own text; when new
  activity is paused or blocked, a `Callout` replaces the composer.
- **Account standing** (`/account/standing`): one `Callout` for the state
  (success, attention, or danger for paused and suspended), the strikes as
  a `panel` list (the held-back text in a quote, struck through once
  removed), then the appeal form or the open appeal and past answers. When
  someone is paused or suspended, the portal layout shows a banner above
  every page linking here.
- **Notifications bell** (top bar, businesses and creators): a ghost icon button with a small `brand-coral` count (9+ past nine) and an aria-label carrying the count. It opens a `Popover`, up to 24rem wide: "Notifications" and "Mark all as read", then the latest 20 as full-width rows: a violet dot and bold title when unread, an optional muted second line (a note or message preview, two lines at most) and the time. Clicking a row marks it read and goes to its page.
- **Repeated forms on one page** (a decision per card, an admin action per
  row) pass their own field `id` (for example `` `note-${applicationId}` ``):
  ids default to the field name, and duplicates break label links.
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

The 2026-11-16 portal rebuild borrows structure from HeroUI Pro's dashboard
templates (grouped sidebar, stat cards, titled cards, a "needs you" list,
compact desktop density). HeroUI Pro is paid, licensed software: we use none
of its code or components, and the portal stays on Tailwind, shadcn/ui and
our tokens. Colours, type, radii and shadows are unchanged.

The 2026-11-10 redesign borrows structure and feel from Passionfroot (the
framed, split onboarding with a gradient panel and a "why we ask" card; soft
aurora gradients) and Clay (the sidebar app shell, quick-action cards with
3D-style icons, the auth split screen). Nothing else is taken: no names,
logos, copy, illustrations, icons or typefaces. Earlier notes on Clay's
marketing site are in `docs/design-inspiration-clay.md`; its cream palette no
longer applies.
