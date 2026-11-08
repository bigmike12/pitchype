# Pitchype

Pitchype is a marketplace that connects Nigerian businesses with micro and nano
creators. Businesses post campaigns or hire creators directly; creators apply,
do the work, and get paid through escrow once the work is approved.

This repository is at **Stage 2**: the public landing page and waitlist, plus
accounts: sign-up, login, password reset, onboarding and an account page.
There are no campaigns or payments yet. `CLAUDE.md` holds the product rules and
engineering guidelines; `docs/BUILD_PROMPT.md` holds the stage plan.

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS v4 · shadcn/ui
(`Button` only) · Supabase (Postgres + Row Level Security) · Vercel.

## Run it locally

You need Node 22.18 or newer, Docker, and the
[Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start                 # local Postgres + API in Docker; applies migrations
cp .env.example .env.local     # then fill it in (see below)
npm run dev                    # http://localhost:3000
```

`supabase status` prints the local API URL and publishable key for `.env.local`.
Local development always points at the local Supabase, never the hosted one.

## Environment variables

| Name                                   | What it is                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL (local: `http://127.0.0.1:54321`)                                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_…`). Safe in the browser; RLS protects the data  |
| `NEXT_PUBLIC_APP_URL`                  | Public site URL for canonical links, sitemap and social cards, e.g. `https://pitchype.com` |

All three are safe to expose. A legacy anon key also works in
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The secret / service-role key is not
used at this stage and must never get a `NEXT_PUBLIC_` name.

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

To apply migrations to a hosted project: `supabase link --project-ref <ref>`
then `supabase db push`.

### The waitlist table

`public.waitlist` (email, role `business` | `creator`, created_at, source).
The anon key can only **insert** (email, role, source); nobody but the service
role can read, change or delete rows. Emails are unique ignoring case.
`supabase/tests/waitlist_rls.test.sql` proves this.

To see signups, use the Supabase dashboard (Table editor) or SQL editor, which
run as the service role.

## Accounts

`/signup`, `/login` and `/forgot-password` work but aren't linked from the
site until launch. After confirming their email, people fill in a short
profile at `/onboarding`, then land on `/account`.

- **One role per account**, chosen at sign-up: business or creator
  (`influencer` in code). It can't be changed afterwards.
- **App-owned identities:** `public.users` holds our own user id; Supabase
  Auth's id is only stored in `auth_user_id`. Profiles live in
  `business_profiles` and `influencer_profiles`.
- **Access rules** are in `supabase/migrations/*_create_users_and_profiles.sql`
  and proven by `supabase/tests/users_profiles_rls.test.sql`.
- **Locally**, emails don't leave your machine: open Mailpit at
  <http://127.0.0.1:54324> to click confirmation and reset links.

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
3. Set the three environment variables above for Production (and Preview if
   you want previews to save signups), using the hosted project's URL and
   publishable key from the Supabase dashboard.
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
   `https://www.pitchype.com`. Email links are built from it.
6. **Supabase → Authentication → Sign in / Providers → Email:** "Confirm email"
   on; minimum password length 8.
7. **Supabase → Authentication → Rate limits:** raise "emails sent per hour"
   (possible once custom SMTP is on).

Email links always point at the Site URL, so a link requested from a Vercel
preview opens production. Test sign-up locally or on production.

## Design tokens

Colours live as CSS variables in `src/app/globals.css` and are available as
Tailwind classes (`bg-canvas`, `text-ink`, `bg-brand-coral`, …). Every
text/background pair used was checked against WCAG AA. The rules that came out
of that check:

- Use **ink** text on coral, lilac, sun, peach and mint. White text only on ink
  and brand green.
- `muted` (#666666) is for secondary text on the cream surfaces only, not on
  the saturated colours.
- Coral is a fill colour, never a text colour on cream (2.7:1).
- `hairline` is for decorative lines. Form fields use `field` (#8a8273), which
  meets 3:1 against cream and white.

Fees shown on the page come from `src/lib/fees.ts` (display only; the real fee
rules will live in the database when payments are built).
