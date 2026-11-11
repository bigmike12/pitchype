# Pitchype

Pitchype is a marketplace that connects Nigerian businesses with micro and nano
creators. Businesses post campaigns or hire creators directly; creators apply,
do the work, and get paid through escrow once the work is approved.

This repository is at **Stage 5**: the public landing page;
accounts (sign-up, login, password reset, onboarding, an account page);
creator profiles with a public directory, handle verification and moderation;
campaigns that businesses publish and creators browse; and applications,
hiring up to the pay step, live chat, blocking and account standing.
Payments and escrow come next (Stage 6). `CLAUDE.md` holds the product rules and
engineering guidelines; `docs/BUILD_PROMPT.md` holds the stage plan.

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS v4 · shadcn/ui
(`Button` only) · Supabase (Postgres + Row Level Security) · Vercel.

## Run it locally

You need Node 22.18 or newer, Docker, and the
[Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start -x studio,edge-runtime,logflare,vector,supavisor,postgres-meta,imgproxy
                               # local Postgres, API, auth, storage and Realtime (chat) in Docker
cp .env.example .env.local     # then fill it in (see below)
npm run dev                    # http://localhost:3030
```

`supabase status` prints the local API URL and publishable key for `.env.local`.
Local development always points at the local Supabase, never the hosted one.

## Environment variables

| Name                                   | What it is                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL (local: `http://127.0.0.1:54321`)                                                                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_…`). Safe in the browser; RLS protects the data                                                 |
| `NEXT_PUBLIC_APP_URL`                  | Public site URL for canonical links, sitemap and social cards, e.g. `https://pitchype.com`                                                |
| `SUPABASE_SECRET_KEY`                  | **Server-only.** Supabase secret key (`sb_secret_…`), used for profile photos and the lapse job                                           |
| `CRON_SECRET`                          | **Server-only.** Shared secret for `/api/cron/expire-engagements` (sent as `Authorization: Bearer …`; Vercel Cron sends it automatically) |

The first three are safe to expose. A legacy anon key also works in
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The secret key bypasses row level
security: it is read only by `src/lib/supabase/admin.ts`, must never get a
`NEXT_PUBLIC_` name, and goes in Vercel's settings as a sensitive variable.
Without it everything works except photo uploads.

Two local env files, both git-ignored:

| File                    | Used by                         | Points at                                 |
| ----------------------- | ------------------------------- | ----------------------------------------- |
| `.env.local`            | `npm run dev`                   | Local Supabase                            |
| `.env.production.local` | `npm run build` and `npm start` | The live project (overrides `.env.local`) |

So a local production build writes real signups to the live database. To test
a production build against local Supabase instead, set the variables on the
command line, which beats both files:
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local key> npm run build`.
`NEXT_PUBLIC_*` values are baked in at build time, so rebuild after changing them.
Vercel reads neither file; set the live values in its settings.

## Scripts

| Command                           | Does                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                     | Dev server                                                 |
| `npm run build` / `npm start`     | Production build / serve it                                |
| `npm run lint`                    | ESLint                                                     |
| `npm run typecheck`               | `tsc --noEmit`                                             |
| `npm test`                        | Unit tests (Node's built-in test runner)                   |
| `npm run format` / `format:check` | Prettier                                                   |
| `npm run db:types`                | Regenerate `src/types/database.ts` from the local database |

## Database

Schema lives only in `supabase/migrations/`. Never edit an applied migration;
add a new one.

```bash
supabase migration new <name>  # create a migration
supabase db reset              # rebuild the local database from scratch
supabase test db               # run the pgTAP tests in supabase/tests/
npm run db:types               # after any schema change
```

### Pushing migrations to the live database

The repo is already linked to the live project (`supabase/.temp/project-ref`;
on a new machine run `supabase link --project-ref <ref>` first). Do this
after the change is merged or ready, never before it's tested locally:

```bash
supabase migration up            # 1. apply to your LOCAL database (keeps your data)
supabase test db                 # 2. all database tests must pass
supabase migration list --linked # 3. Local vs Remote: a blank Remote means "not pushed yet"
supabase db push --dry-run       # 4. lists what WOULD run on live; changes nothing
supabase db push                 # 5. applies it to live (asks y/n)
```

Rules:

- Read the dry-run list: it should be exactly the migrations you expect, in
  order. If a Remote row has no Local file, stop and work out why first.
- Never edit a migration that's already been pushed. Add a new file.
- A pushed migration can't be undone by deleting it. Fix forward with a new
  migration.
- Afterwards check Supabase's security advisor (Dashboard, Advisors) and that
  every table still has RLS on.
- Take a backup first for anything that rewrites or drops data (Dashboard,
  Database, Backups).

### The waitlist table

The site no longer has a waitlist (2026-11-10): it links straight to sign-up.
The table stays because it holds the people who signed up before, who should
hear that Pitchype is open. Nothing in the app writes to it now.

`public.waitlist` (email, role `business` | `creator`, created_at, source).
The anon key can only **insert** (email, role, source); nobody but the service
role can read, change or delete rows. Emails are unique ignoring case.
`supabase/tests/waitlist_rls.test.sql` proves this.

To see signups, use the Supabase dashboard (Table editor) or SQL editor, which
run as the service role.

## Accounts

`/signup`, `/login` and `/forgot-password` are linked from the site.
`/signup?role=business` or `?role=influencer` opens with that account type
chosen. After confirming their email, people fill in a short
profile at `/onboarding` (creators go on to niches, platforms, a photo and
publishing), then land on `/home`. `/account` holds their settings.

- **One role per account**, chosen at sign-up: business or creator
  (`influencer` in code). It can't be changed afterwards.
- **App-owned identities:** `public.users` holds our own user id; Supabase
  Auth's id is only stored in `auth_user_id`. Profiles live in
  `business_profiles` and `influencer_profiles`.
- **Access rules** are in `supabase/migrations/*_create_users_and_profiles.sql`
  and proven by `supabase/tests/users_profiles_rls.test.sql`.
- **Locally, emails never reach a real inbox.** Local Supabase delivers every
  confirmation and reset email to Mailpit at <http://127.0.0.1:54324>; open
  them there. Set `NEXT_PUBLIC_APP_URL` in `.env.local` to the address your
  dev server actually runs on (e.g. `http://localhost:3001`), because email
  links point at it.
- **The app doesn't send auth emails itself.** Supabase Auth sends them using
  its own email settings (`supabase/config.toml` locally, the dashboard when
  hosted), so a `RESEND_API_KEY` in the app's env files does nothing.

## Creator profiles and the directory

Decisions are in `docs/BUILD_PROMPT.md` (Stage 3) and CLAUDE.md §12.

- **Creators** edit their public profile at `/profile`: photo, bio, one to
  three niches, state and city, an optional starting rate, and their
  platforms (Instagram, TikTok, YouTube, X) with a follower range. Profiles
  are drafts until published. Creators can keep their page out of search
  engines.
- **The directory** is `/creators` (filters: niche, platform, followers,
  state) and `/creators/<slug>`. Signed-out visitors and creators see names,
  photos, niches, location and follower ranges. Signed-in businesses (and
  admins) also see handles, bios and starting rates, and can filter by rate.
  The database enforces this: the directory is read only through
  `search_creators()`, `get_listed_creator()` and `indexable_creators()`, and
  the tables are closed to visitors. It isn't linked from the site until
  launch, like sign-up.
- **Verification:** a creator asks for a code (`pitchype-7K3F9Q`), puts it in
  their bio within 48 hours and presses "I've added it". An admin checks the
  bio at `/admin`, records the follower count seen, and verifies or rejects.
  One verified account per handle; verifying a handle that's verified
  elsewhere moves the badge (the admin page warns first). Changing or removing
  a handle drops its badge.
- **Moderation:** anyone can report a profile. Admins see reports at `/admin`
  and can close them, remove the photo, or hide the profile with a reason the
  creator sees (and show it again later).
- **Niches** are rows in `public.niches`. To add one, run in the SQL editor:
  `insert into public.niches (slug, name, sort_order) values ('pets', 'Pets', 180);`
  It appears within an hour (the list is cached).
- **Photos** go through `src/lib/profile-photo.ts` (sharp: checks the real
  file type, strips EXIF/GPS, crops to 512px square WebP) and are stored by
  `src/lib/storage.ts` in the `profile-photos` bucket. Access rules are proven
  by `supabase/tests/creator_directory_rls.test.sql`.

**Making someone an admin** (there's no admin sign-up). They sign up and
confirm their email as usual, then you run this in the Supabase SQL editor:

```sql
update public.users set role = 'admin' where email = 'their@email.com';
```

## Deploy to Vercel

The hosted Supabase project is `pitchype` (ref `byhbrzwhlvfhsrzkzgfx`,
Frankfurt). The repo is linked to it, so new migrations go up with
`supabase db push` (try `--dry-run` first).

1. Import the repo in Vercel (framework preset: Next.js).
2. In Project Settings → Functions, set the region to **Frankfurt (fra1)** so
   server code runs next to the database.
3. Set the environment variables above for Production (and Preview if you
   want previews to save signups), using the hosted project's URL, publishable
   key and secret key from the Supabase dashboard (API keys). Mark
   `SUPABASE_SECRET_KEY` as sensitive.
4. Deploy. Check `/robots.txt`, `/sitemap.xml` and a test signup afterwards.

The app doesn't depend on Vercel: `npm run build && npm start` runs it on any
Node host. `docs/PROVIDERS.md` lists every provider-specific piece and how to
replace it.

### Auth email setup (hosted, one-off)

Supabase's built-in email sender only reaches your own Supabase team, so real
users need Resend before sign-up works for them.

1. **Resend:** create an account, add the domain `pitchype.com`, and add the
   DNS records Resend shows at your domain registrar. Wait until Resend says
   the domain is verified.
2. **Resend → API keys:** create a key with sending access for `pitchype.com`.
3. **Supabase → Authentication → Emails → SMTP settings:** enable custom SMTP
   with host `smtp.resend.com`, port `465`, username `resend`, password = the
   API key, sender email `no-reply@pitchype.com`, sender name `Pitchype`.
4. **Supabase → Authentication → Emails → Templates:**
   - "Confirm signup": subject `Confirm your Pitchype account`, body = the
     contents of `supabase/templates/confirmation.html`.
   - "Reset password": subject `Reset your Pitchype password`, body =
     `supabase/templates/recovery.html`.
5. **Supabase → Authentication → URL configuration:** Site URL
   `https://www.pitchype.com`. Under Redirect URLs, add any other address the
   app runs on (for example a Vercel preview domain); email links only point
   at addresses listed here.
6. **Supabase → Authentication → Sign in / Providers → Email:** "Confirm email"
   on; minimum password length 8.
7. **Supabase → Authentication → Rate limits:** raise "emails sent per hour"
   (possible once custom SMTP is on).

Email links point at the app's own `NEXT_PUBLIC_APP_URL` (the templates use
`{{ .RedirectTo }}`), falling back to the Site URL if that address isn't on
the Redirect URLs list. The app's Supabase migrations must be pushed
(`supabase db push`) before sign-up works on the hosted project; confirming
an email creates the app's user row.

## Campaigns

Decisions: `docs/campaign-spec-decisions.md`; scope and build choices:
`docs/BUILD_PROMPT.md` (Stage 4).

- **Businesses** manage campaigns at `/business/campaigns`: title, brief,
  notes, what each creator posts (platform, type, quantity), who can apply
  (follower minimum per platform, niches, states, verified only), dates and a
  fixed price per creator. Drafts show how many listed creators qualify and
  the most the business could spend. A business's **first** campaign waits
  for an admin at `/admin`; after one approval, later campaigns publish at
  once. Live campaigns can be paused, resumed or closed, and only their
  wording, places and (later) deadlines can change; every version of the
  wording is kept.
- **Creators** browse open campaigns at `/campaigns`, filter them, and see
  for each one whether they qualify and what to change if not. They can
  report a campaign; admins take campaigns down with a reason the business
  sees. They apply from the campaign page (see below).
- **Visitors** only see the number of open campaigns, on the landing page
  (cached for an hour).
- **Rules live in the database:** `transition_campaign()` is the one place
  statuses change; locks, visibility and eligibility are enforced there and
  proven by `supabase/tests/campaigns_rls.test.sql`. Phone numbers, emails
  and WhatsApp/Telegram links are refused in briefs and in creator bios
  (`src/lib/contact-details.ts`).

## Applications, chat and account standing

Design: `docs/superpowers/specs/2026-11-10-stage-5-applications-chat-design.md`.

- **Creators** apply from a campaign page, at the campaign price or their
  own (whole naira, at least ₦5,000), with an optional note; they can change
  it or withdraw while it's undecided. `/applications` lists them.
- **Businesses** review applicants at `/business/campaigns/[id]/applications`:
  shortlist, pass (with an optional note) or hire. Hiring creates an
  engagement waiting for payment and opens the pay page. It lapses after
  48 hours unpaid, and until Stage 6 it can't be paid. Two hires can never
  over-fill a campaign, and a price the creator changed since the page
  loaded is refused.
- **Chat** at `/inbox`: the business starts a thread; new messages arrive
  live through Supabase Realtime (the `messages` table is in the
  `supabase_realtime` publication). Messages with phone numbers, emails or
  links to other apps aren't delivered and count as strikes: 1 warns, 2
  pause new activity for 3 days, 3 suspend the account until an admin
  reviews. People can block each other, see their standing at
  `/account/standing` and appeal once a day; admins review at `/admin`.
  Strikes and blocks never touch money (CLAUDE.md §6.5).
- **The lapse job** is `GET /api/cron/expire-engagements`, run daily (03:00 UTC) by
  `vercel.json` and protected by `CRON_SECRET`. Any scheduler can call it. A
  hire is lapsed once its 48 hours have passed, so the cancellation can come
  up to a day later; the job never touches a hire still inside its window.
- **Rules live in the database** and are proven by
  `supabase/tests/applications_rls.test.sql`, `chat_rls.test.sql` and
  `moderation_rls.test.sql`.

## Deferred work

Setup steps and polish parked for later (email, Vercel, launch switches,
follow-ups) are listed in [`docs/TODO.md`](docs/TODO.md).

## Design system

Every page (landing, sign-in, onboarding, account) shares one design system:
tokens and utilities in `src/app/globals.css`, components in
`src/components/ui`, and the brand kit and page shells in
`src/components/brand` and `src/components/shells`. Read
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) before building a page: it
covers colours and their contrast rules, type, spacing, radii, components and
the page patterns.

Fees shown on the page come from `src/lib/fees.ts` (display only; the real fee
rules will live in the database when payments are built).
