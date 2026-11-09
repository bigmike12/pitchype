# Portal UI pass: design

Date: 2026-11-09. Status: approved and implemented on branch `portal-ui`.

A UI audit and redesign of the signed-in business and creator portals before
Stage 5, taking the structure of Clay's onboarding and in-app screens (layout
only, as with the auth pages: no Clay name, copy, colours, icons or
typeface). Mockups from the brainstorm are in
`.superpowers/brainstorm/` (not committed).

## 1. Why

Stage 5 adds applications, chat and an inbox; they need a place to live.
Today the signed-in product reads as a set of documents rather than an app.

### Audit findings

1. **No navigation.** Signed-in pages have a wordmark and Sign out only;
   moving around means a "Your account" link at the top of each page
   (already in `docs/TODO.md`).
2. **No home.** `/account` doubles as one: an email/role box, link cards,
   the business profile form and a "What happens next" paragraph. Nothing
   says where you stand or what to do next.
3. **Onboarding stops early.** It asks for name, state and city, then
   leaves creators on `/account`. Everything that gets them into the
   directory (niches, platforms, photo, publish) is on a long `/profile`
   page they have to find.
4. **Profile editing lives in two places**: businesses on `/account`,
   creators on `/profile`.
5. **Status messages look different on every page.** On a business's
   campaign page, draft, paused and live are grey text, "in review" a cream
   card, "sent back" a sun card; the creator profile's visibility box is a
   third style.
6. **Empty states are bare sentences** ("No campaigns yet.") with no next
   step.
7. **A signed-in business browsing creators leaves the app**: the directory
   is a marketing page with "Join the waitlist" in its header.
8. **Page titles are marketing-sized** (`text-display-lg`, up to 52px) on
   every working screen.

## 2. Decisions

| Topic | Decision |
|---|---|
| Scope | Full pass: shell and navigation, a home page per role, step-by-step onboarding, consistency fixes on every portal page |
| Navigation | Sidebar on desktop; top bar with a menu button opening a drawer on phones |
| Top bar | Desktop: a bar above the work area with the section name on the left, the role's main action and Help on the right |
| Look | White and uniform, like Clay's app: sidebar, top bar and work area all white, separated by hairlines. Cards white with a hairline outline. Cream only for the active nav item and small highlights; brand colours only in icon tiles, pills and callouts |
| Onboarding | Focused single column, one question per screen, on white |
| Creator onboarding | Up to publishing: name, location, niches, platforms, photo, then publish or keep as draft |
| Business onboarding | Same data as today, one question per screen, then a finish screen |
| Find creators | Inside the app, sharing code with the public directory |
| Shell placement | One layout for all portal pages (approach A) |

The page background is white everywhere since 2026-11-09: the `canvas`
token changed from cream to #FFFFFF, so the landing page, directory, legal
and auth pages are white too (already applied, ahead of this pass). Cream
stays in `surface-soft` and `surface-card`. Nothing in this pass
changes the database schema, adds a dependency, or changes what anyone can
see or do (RLS and server checks stay as they are).

## 3. Structure and routes

Route groups move; URLs don't (except the new ones below).

```
src/app/
  (portal)/                      layout.tsx renders PortalShell once
    home/                        new: role home
    account/                     settings (was (app)/account); keeps the
                                 profile form and its actions, which
                                 onboarding imports
    (business)/business/...      campaigns (as today), creators (new)
    (influencer)/campaigns, profile
    (admin)/admin
  (onboarding)/onboarding/       layout.tsx renders OnboardingShell
    page.tsx                     name and location (both roles)
    niches/ platforms/ photo/    creators only
    done/                        both roles
  (app)/                         removed; sign out and the loading notice
                                 move to (portal)/
```

| Route | Purpose |
|---|---|
| `/home` (new) | Landing page after login, password reset, onboarding and wrong-role redirects, for businesses and creators. Admins are sent to `/admin`. |
| `/account` | Settings: email and account type; the business profile form (businesses); a link to the profile editor (creators); sign out. |
| `/business/creators` (new) | The directory inside the app. Same filters, results and paging as `/creators`. |
| `/business/creators/[slug]` (new) | A creator's profile inside the app. `noindex`; the public page stays canonical. |
| `/onboarding/...` | Section 5. |

Redirect changes: `requireRole`'s fallback, login, password reset, the
proxy's signed-in redirect and onboarding all point to `/home` instead of
`/account`. `/home` joins `SIGNED_IN_ONLY` and the matcher in
`src/proxy.ts`. The README line "then land on `/account`" changes too.

`requireUser` is wrapped in React's `cache()` so the layout and the page
share one session lookup per request.

## 4. Portal shell

`src/components/shells/portal-shell.tsx` replaces `app-shell.tsx`.

**Desktop (1024px and up):** a fixed 240px white sidebar with a hairline
right edge, and beside it a 64px white top bar (hairline bottom) over the
work area.

- Sidebar, top to bottom: wordmark (links to `/home`); nav links; at the
  bottom, above a hairline, the account (avatar, name, "Account", linking to
  `/account`) and a Sign out button.
- Nav links per role:
  - Business: Home, Campaigns (`/business/campaigns`), Find creators
    (`/business/creators`)
  - Creator: Home, Campaigns (`/campaigns`), Your profile (`/profile`)
  - Admin: Admin (`/admin`)
- Active link: `bg-surface-soft`, hairline ring, semibold, and
  `aria-current="page"`. A link is active on its own path and everything
  under it (`/business/campaigns/123` keeps Campaigns active); Home only on
  `/home`.
- Top bar: the active section's name on the left; on the right the role's
  main action (business: "New campaign"; creator: "Find campaigns"; admin:
  none) and a Help icon button (`mailto:` the contact address, labelled
  "Help: email us").
- Avatar: the creator's photo when they have one, otherwise initials on a
  brand colour picked from the name (as `CreatorPhoto` does).

**Phones and tablets (below 1024px):** a 56px white top bar with the
wordmark and a menu button. The button opens a drawer from the left with
the sidebar's contents and the role's main action. Built like the landing
page's `MobileMenu` (plain state, no dependency): Escape and the backdrop
close it, focus moves into it and back to the button, the page behind
doesn't scroll, and it closes on navigation.

**Loading:** the frame (bars, wordmark) is static and paints at once. The
role-dependent parts (links, main action, avatar, name) render inside one
`Suspense` boundary with a neutral placeholder of the same size, so nothing
jumps.

**Work area:** white, `px-4 sm:px-6 lg:px-8`, `py-8 lg:py-10`. Pages pick a
width: `max-w-3xl` for reading and forms, full width for grids and tables.

## 5. Onboarding

`src/components/shells/onboarding-shell.tsx`: white page; a 3px progress
bar along the top (ink fill on hairline); wordmark at top left, Sign out at
top right; a centred `max-w-lg` column. Each step has a clay icon tile, a
"Step N of M" line (also how screen readers hear progress; the bar itself
is `aria-hidden`), a back link beside the `text-display-lg` heading (none on
the first step), a one-line lead, the question, and an ink Continue button
(full width on phones). The green illustration panel isn't used here.

### Business (4 steps)

1. "What's your business called?" (business name)
2. "And your name?" (contact name; hint: the person creators talk to)
3. "Where are you based?" (state and town or city)
4. Done: "You're all set, {name}". Two action cards: Post your first
   campaign (`/business/campaigns/new`) and Find creators
   (`/business/creators`), plus a "Go to your home" link.

Steps 1 to 3 are one form shown a screen at a time on the client. The
browser checks the visible fields before moving on; the server action
(today's `createProfileAction`) validates everything on submit and, if a
field fails, the form opens on that field's screen with the error.
Signed-in pages need JavaScript (their content streams in behind Suspense),
so the form always shows one screen; there is no no-JS fallback.

### Creator (6 steps)

1. "What should businesses call you?" (display name)
2. "Where are you based?" (state and town or city). Steps 1 and 2 work like
   the business form; submitting creates the profile.
3. "What do you post about?" Niche pills, up to 3. Saves on Continue.
4. "Where do you post?" The profile page's platform cards (handle and
   follower range, each saved on its own), without the verification part.
   Continue is enabled once one platform is saved.
5. "Add a photo". The profile page's photo form. "Skip for now" is offered.
6. Done: a preview of their directory card (`CreatorCard`), what's still
   missing if anything, and two buttons: "Publish my profile" (disabled with
   the reason while niches or a platform are missing) and "Keep it as a
   draft". Both go to `/home`.

Steps 3 to 5 also offer "Finish later", which goes to `/home`; the home
checklist picks up from there. Each step page sends people without a
profile back to `/onboarding`, and `/onboarding` sends people who have one
to `/home`. Admins never see onboarding.

### Code reuse

- `parseNiches(form, slugs)` is extracted from `parseAboutForm` and used by
  both; a narrow `setCreatorNiches(userId, niches)` joins `lib/db/creators.ts`.
- The niche pills move out of `about-form.tsx` into a `NichePicker`
  component used by both forms.
- `PlatformCard` gets a prop to hide verification; `PhotoForm` is reused as
  is.
- Publishing from the done step uses the existing publish rules
  (`publishProblems`, `setCreatorPublished`) and redirects to `/home`.

## 6. Home pages

Both start with "Hi {first name}" (`text-display-page`; the first word of
the business's contact name or the creator's display name) and a one-line
lead.

### Business

1. **Needs attention:** one `Callout` per campaign that is in review (sun),
   sent back with a note (sun, quoting the note) or taken down (danger,
   quoting the reason), each linking to the campaign. At most three, newest
   first.
2. **Quick actions:** three `ActionCard`s: Post a campaign (sun tile), Find
   creators (lilac tile), Your campaigns (mint tile, with live, in review
   and draft counts).
3. **Recent campaigns:** up to 5 rows (title, status pill, price per
   creator, places, applications close) with "See all". A table from 640px
   up; a stacked list on phones. With no campaigns, an `EmptyState`: "Post
   your first campaign", a line on how it works, the button.

`listOwnCampaigns` adds `review_note` to its select (no schema change).

### Creator

1. **Profile status**, one of:
   - Not published: a "Get listed in the directory" checklist with a
     progress bar. Items: choose your niches, add a platform, add a photo,
     write a bio and set a starting rate, publish. Done items are ticked
     (and hidden on phones); each open item links to the right place; the
     last one is the Publish button, enabled once niches and a platform
     exist.
   - Published and listed: a slim mint callout, "You're in the directory",
     with "View your page", plus one nudge if an account isn't verified.
   - Hidden by Pitchype: a danger callout with the reason and the contact
     address; it replaces the above.
2. **Campaigns you qualify for:** up to 3 `CampaignCard`s and "See all
   campaigns". If none, an `EmptyState` pointing to the profile.

### Admin

No home of its own: `/home` redirects admins to `/admin`.

## 7. Design system changes

Code and `docs/DESIGN_SYSTEM.md` change together.

**Rules**

- Every page sits on white (`canvas` is #FFFFFF; done ahead of this pass).
- In the portal, panels are white with `ring-1 ring-hairline`. Tinted fills
  are for callouts, pills, tiles and the active nav item only;
  `bg-surface-card` blocks are replaced.
- Filter panels become a white outlined toolbar.

**New utility**

- `text-display-page`: Bricolage 600, 28px on phones to 36px on desktop.
  Portal page titles and the home greeting. `text-display-lg` stays for
  marketing, auth and onboarding headings; `text-display-md` for section
  headings inside portal pages.

**New components**

| Component | File | Use |
|---|---|---|
| `PortalShell` | `shells/portal-shell.tsx` | Section 4 (with a small client file for the nav links and drawer) |
| `OnboardingShell` | `shells/onboarding-shell.tsx` | Section 5 |
| `ClayTile` | `brand/stickers.tsx` | A rounded square in a brand colour with `clay()` shading and a Lucide icon; sizes 36 and 44px. Onboarding steps, action cards, empty states |
| `PageHeader` | `ui/page-header.tsx` | Optional crumbs (e.g. "Campaigns / Jollof week launch"), the title, a lead, and actions on the right (stacking on phones) |
| `Callout` | `ui/callout.tsx` | Tones `info` (surface-soft), `attention` (sun), `success` (mint), `danger` (white with a danger border and icon). Icon, bold title, text, optional link. Replaces `StatusNotice`, the profile visibility box and the other one-off notices |
| `EmptyState` | `ui/empty-state.tsx` | Clay tile, title, one line, optional action |
| `ActionCard` | `ui/action-card.tsx` | White outlined card: tile, title, one line; the whole card is the link. Business home and the business onboarding done step |

`AppShell` is deleted once nothing uses it. `StatusPill` stays.

## 8. Page-by-page changes

Every portal page: no own shell, no "Your account" link, a `PageHeader`,
callouts and empty states from section 7, white outlined panels.

| Page | Changes beyond the above |
|---|---|
| Business campaigns list | Table from 640px up (title, status, price, places, closes), list on phones; empty state |
| Business campaign page | Crumbs; status notice and the "no creator qualifies" warning become callouts; the three figures become white outlined stat cards |
| New and edit campaign | Crumbs; forms unchanged |
| Creator campaigns list | Filters as a toolbar; empty state |
| Creator campaign page | Crumbs; notices as callouts |
| Creator profile | Visibility box becomes a callout with its buttons; photo, about and platforms each in a white outlined section |
| Account | Settings layout: "Sign-in" (email, account type), "Business profile" (form), sign out |
| Admin | Shell and `PageHeader` only; content unchanged |
| In-app directory | `/creators`' filters, grid and paging move into shared components used by both routes; `CreatorCard` takes the link base (`/creators` or `/business/creators`). The in-app profile shares the public page's content component, without the waitlist prompt and JSON-LD |

## 9. Testing

- **Unit tests** (`node --test`) for the new pure helpers: active-link
  matching, the creator's next onboarding step, the home checklist, and the
  business "needs attention" list.
- `npm run lint`, `npm run typecheck`, `npm test`, and the database tests;
  no migrations change.
- **In the browser**, against local Supabase with throwaway `e2e-*`
  accounts (deleted afterwards): sign up and onboard as a business and as a
  creator, including skipping, going back, "Finish later" and an invalid
  field; every portal page at 375px and 1280px; the drawer and sidebar by
  keyboard only; reduced motion. Before and after screenshots of each page.
- Lighthouse accessibility on `/home` (both roles) and one onboarding step.

## 10. Not in this pass

- Collapsing the sidebar to icons (easy to add when Inbox and Wallet make
  the list longer).
- The notification bell (Stage 8).
- Redesigning the admin page's content, the marketing site or the auth
  pages.
- Dark mode, new dependencies, schema changes.
- Stage 5 features (applying, chat, inbox).

## 11. Docs to update in the same change

- `docs/DESIGN_SYSTEM.md`: section 7 and the page patterns (portal pages,
  onboarding, in-app directory).
- `CLAUDE.md` §4: the route groups (`(portal)`, `(onboarding)`).
- `docs/TODO.md`: tick "Signed-in pages have no navigation bar"; add the
  sidebar collapse and the notification bell.
- `README.md`: new users land on `/home`.
- `.gitignore`: `.superpowers/`.
