# Provider dependencies and how to replace them

Pitchype runs on Vercel and Supabase today, but must be movable to plain
Node.js/Docker, self-hosted Postgres and another auth provider without a
rewrite (CLAUDE.md §2a). This file lists every place the code depends on a
provider and what replacing it would take. **Update it whenever a provider
dependency is added or removed.**

## Supabase Postgres (database)

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Schema | `supabase/migrations/*.sql` | No: plain SQL, Postgres 13+ (`gen_random_uuid`, check constraints, unique index) | Apply the files in filename order with `psql` or any migration runner |
| Database roles | Grants and RLS policies name `anon` and `authenticated` | Yes: these are the roles Supabase's API uses | The app connects as its own role instead; grant that role what `lib/db/*` needs. Keep RLS as defence in depth |
| Queries | `src/lib/db/*.ts` only | Yes: they use `supabase-js` (`.from(...).insert(...)`) | Rewrite those files with a Postgres client (e.g. `pg`, `postgres`). Callers don't change |
| Client setup | `src/lib/supabase/server.ts` | Yes | Delete with the step above |
| Generated types | `src/types/database.ts` via `npm run db:types` | Yes: Supabase CLI | Hand-written row types or another Postgres codegen |
| Database tests | `supabase/tests/*.sql` (pgTAP, run by `supabase test db`) | Partly: pgTAP is standard; the tests switch to the `anon` role | Run with `pg_prove`; switch to the app's role |
| Local stack | `supabase/config.toml`, `supabase start` | Yes | Any local Postgres (e.g. a Docker `postgres` container) |

**Export and restore data:** `supabase db dump --data-only > data.sql` (or
`pg_dump` with the connection string from the dashboard), then restore with
`psql` after applying the migrations.

## Supabase Auth

Identities are app-owned: `public.users` has our own `id`, and business tables
reference it. The provider's user id sits in `users.auth_user_id`, with no
foreign key into Supabase's `auth` schema.

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Sign-up, login, sign-out, password reset, emailed links, "who is signed in" | `src/lib/auth.ts`, the only file that calls `supabase.auth` | Yes | Rewrite this file against the new provider. Callers use `signUp`, `signIn`, `requireUser`, etc. and don't change |
| Session cookies and refresh | `src/proxy.ts` → `src/lib/supabase/proxy.ts` | Yes | The new provider's session handling |
| Identity inside SQL | `public.current_user_id()` and `public.create_app_user()` read `auth.uid()` / `auth.jwt()`. Every RLS policy goes through `current_user_id()` | Yes, but only those two functions | Reimplement them, e.g. from a `current_setting('app.user_id')` the app sets per connection |
| Email templates | `supabase/templates/*.html` (Go template variables like `{{ .TokenHash }}`) | Partly | Port the wording and links to the new provider's templates |
| Sending auth email | Resend, configured as custom SMTP in the Supabase dashboard | Config only | Point the new provider's SMTP at Resend |
| Rate limits on sign-in and token refresh | Supabase counts per IP; calls from our server share the server's IP | Yes | If limits bite at scale: enable IP forwarding (`Sb-Forwarded-For`, needs a secret key) |

Access control lives in both places on purpose: RLS (through
`current_user_id()`) protects every table, and `lib/db` functions take
explicit user ids, so they keep working with a plain Postgres client.

**Moving users out:** `auth.users` (passwords are bcrypt hashes, which most
providers can import) and `public.users` both export with `pg_dump`.

## Supabase Storage (profile photos)

Creators' photos are processed on our server (`src/lib/profile-photo.ts`,
using `sharp`, which runs anywhere Node does) and only the result is stored:
a 512px WebP named `<user id>/<version>.webp`. The database stores only the
version number, so the storage provider never appears in business data.

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Upload, delete, public URL | `src/lib/storage.ts`, the only file that touches storage | Yes: `supabase.storage` | Rewrite this file for S3, R2 or local disk (keep the same path scheme). Callers don't change |
| The bucket | `supabase/migrations/*_create_profile_photos_bucket.sql` inserts into `storage.buckets` | Yes | Create the bucket (public read, server-only write) in the new provider; skip this migration on plain Postgres |
| Server-only writes | `src/lib/supabase/admin.ts` (the secret key, `SUPABASE_SECRET_KEY`). No storage policies, so nobody else can write | Yes | The new provider's server credentials |
| Recording the current photo | `setPhotoVersion` in `src/lib/db/creators.ts` uses the same secret-key client, because creators can't write that column | Partly | With a direct Postgres connection, the app's own role writes it |

**Export:** download the bucket with the Supabase CLI
(`supabase storage cp -r ss:///profile-photos ./profile-photos --experimental`)
or the Storage API, then upload the same paths to the new provider.

## Vercel (hosting)

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Running the app | `next build` then `next start` (Node 22.18+) | No | Any Node host. For Docker, add `output: "standalone"` to `next.config.ts` and a small Dockerfile when the move happens |
| Production URL fallback | `src/lib/site.ts` reads `VERCEL_PROJECT_PRODUCTION_URL` | Optional | Set `NEXT_PUBLIC_APP_URL` and the fallback is never used |
| Client IP for rate limiting | `src/components/landing/waitlist-action.ts` reads `x-forwarded-for` | Behaviour, not code | Make sure the proxy in front sets/overwrites `x-forwarded-for` |
| Cached pages (`use cache`) | Footer year | No | Next's default in-memory cache works on one instance; multiple instances need a shared cache handler |
| Function region | Vercel project setting (Frankfurt, next to the database) | Setting only | Host the app near the database |
| Request size | Vercel stops request bodies at 4.5MB, so the browser shrinks photos before upload; `next.config.ts` allows Server Actions up to 6MB for the 5MB photo limit | Behaviour, not code | On other hosts, make sure the proxy in front allows ~6MB bodies |

## Build-time only

- **Google Fonts** via `next/font`: downloaded at build time and served from
  our own domain. The build needs internet access; visitors never contact Google.

## Not used yet

Paystack, Resend (beyond the auth SMTP above), Supabase Realtime and scheduled
jobs (Vercel Cron or `pg_cron`) will each get a section here, with their
boundary module, when they're introduced.
