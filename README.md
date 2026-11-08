# Pitchype

Pitchype is a marketplace that connects Nigerian businesses with micro and nano
creators. Businesses post campaigns or hire creators directly; creators apply,
do the work, and get paid through escrow once the work is approved.

This repository is at **Stage 1**: a public landing page with a waitlist. There
is no auth, no payments and no dashboard yet. `CLAUDE.md` holds the product
rules and engineering guidelines; `docs/BUILD_PROMPT.md` holds the stage plan.

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

`supabase status` prints the local API URL and anon key for `.env.local`.

## Environment variables

| Name                            | What it is                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (local: `http://127.0.0.1:54321`)                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key. Safe in the browser; RLS protects the data                     |
| `NEXT_PUBLIC_APP_URL`           | Public site URL for canonical links, sitemap and social cards, e.g. `https://pitchype.com` |

All three are safe to expose. Newer Supabase projects label the anon key as
the "publishable key" (`sb_publishable_…`); either works in
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. The service-role key is not used at this stage
and must never get a `NEXT_PUBLIC_` name.

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

## Deploy to Vercel

1. Create a Supabase project, then `supabase link --project-ref <ref>` and
   `supabase db push` to create the table.
2. Import the repo in Vercel (framework preset: Next.js).
3. Set the three environment variables above for Production (and Preview if
   you want previews to save signups). Use the hosted project's URL and anon key.
4. Deploy. Check `/robots.txt`, `/sitemap.xml` and a test signup afterwards.

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
