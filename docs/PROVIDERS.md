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

## Supabase Storage (profile photos, covers, work samples and proof of work)

Creators' photos, covers and work samples are processed on our server
(`src/lib/profile-photo.ts`, using `sharp`, which runs anywhere Node does) and
only the result is stored, in the public `profile-photos` bucket:

- photo: a 512px square WebP, `<user id>/<version>.webp`
- cover (since 2026-11-23): 1600×900 WebP, `<user id>/cover-<version>.webp`
- work sample (since 2026-11-23): longest side 1200px, shape kept,
  `<user id>/sample-<sample id>-<version>.webp`

Every file is under the bucket's 1MB limit (the pipeline lowers the quality
until it fits). The database stores only version numbers (and sample ids), so
the storage provider never appears in business data. A version is never
reused (`nextImageVersion`), because files are cached for a year under it.

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Upload, delete, public URL | `src/lib/storage.ts`, the only file that touches storage | Yes: `supabase.storage` | Rewrite this file for S3, R2 or local disk (keep the same path scheme). Callers don't change |
| The bucket | `supabase/migrations/*_create_profile_photos_bucket.sql` inserts into `storage.buckets` | Yes | Create the bucket (public read, server-only write) in the new provider; skip this migration on plain Postgres |
| Server-only writes | `src/lib/supabase/admin.ts` (the secret key, `SUPABASE_SECRET_KEY`). No storage policies, so nobody else can write | Yes | The new provider's server credentials |
| Recording the current photo, cover and sample image | `setPhotoVersion`, `setCoverVersion` and `setSampleImageVersion` in `src/lib/db/creators.ts` use the same secret-key client, because creators can't write those columns | Partly | With a direct Postgres connection, the app's own role writes them |

**Export:** download the bucket with the Supabase CLI
(`supabase storage cp -r ss:///profile-photos ./profile-photos --experimental`)
or the Storage API, then upload the same paths to the new provider.

**Proof of work (`work-proof` bucket, Stage 7).** Screenshots creators and
businesses attach to a submission or a dispute statement go through the same
kind of pipeline (`src/lib/proof-image.ts`, `sharp`): contents checked, turned
upright, shrunk to 2,000px on the longest side, saved as WebP with no
metadata, at most 5 MB. Unlike profile photos the bucket is **private**: pages
show them through signed URLs that last 10 minutes.

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Upload, signed URLs, delete | `src/lib/storage.ts` (`saveProofFile`, `proofFileUrls`, `deleteProofObjects`), the only code that touches the bucket. Objects are named `<owner user id>/<uuid>.webp` | Yes: `supabase.storage` | Rewrite those three functions for S3, R2 or a disk behind signed links (keep the path scheme). Callers don't change |
| The bucket | `supabase/migrations/20261117100000_create_submissions.sql` inserts a private bucket (5 MB, `image/webp` only) into `storage.buckets`, with no storage policies | Yes | Create a private bucket in the new provider; skip that insert on plain Postgres |
| Which file belongs to what | `proof_files` table (path, owner, the submission or statement it is attached to), written only by `register_proof_file()` (service role) and the submit and dispute functions | No: plain Postgres | Nothing to change; export the table with the data |
| Removing files that were never attached | `delete_orphan_proof_files()` deletes the rows after a day and returns the paths; the daily job (Scheduled jobs below) then deletes those objects with `deleteProofObjects`. A failed object delete is logged by count and answers 500; the row is already gone, so the leftover file has to be removed by hand | Partly | The storage half is `deleteProofObjects` |

**Export:** as above, for the `work-proof` bucket.

## Vercel (hosting)

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Running the app | `next build` then `next start` (Node 22.18+) | No | Any Node host. For Docker, add `output: "standalone"` to `next.config.ts` and a small Dockerfile when the move happens |
| Production URL fallback | `src/lib/site.ts` reads `VERCEL_PROJECT_PRODUCTION_URL` | Optional | Set `NEXT_PUBLIC_APP_URL` and the fallback is never used |
| Client IP for rate limiting | `src/components/landing/waitlist-action.ts` reads `x-forwarded-for` | Behaviour, not code | Make sure the proxy in front sets/overwrites `x-forwarded-for` |
| Cached pages (`use cache`) | Footer year | No | Next's default in-memory cache works on one instance; multiple instances need a shared cache handler |
| Function region | Vercel project setting (Frankfurt, next to the database) | Setting only | Host the app near the database |
| Request size | Vercel stops request bodies at 4.5MB, so the browser shrinks photos before upload; `next.config.ts` allows Server Actions up to 6MB for the 5MB photo limit | Behaviour, not code | On other hosts, make sure the proxy in front allows ~6MB bodies |

## Supabase Realtime (live chat and the notifications bell)

New messages and notifications reach people over Realtime. It only pushes a "something
changed" signal: the page then re-reads the thread through the server, so
nothing about what a person may see depends on Realtime.

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Subscribing to new messages | `src/app/(portal)/inbox/[id]/live-updates.tsx` with `src/lib/supabase/browser.ts` (publishable key, the person's session) | Yes | Any push channel (Server-Sent Events from a route handler, Pusher, Ably). The thread only needs an "insert happened" event to refresh |
| Subscribing to notifications | `src/app/(portal)/notification-bell.tsx` (same client; refreshes the shell on a new or re-opened notification) | Yes | The same push channel |
| What gets published | `supabase/migrations/*_create_chat.sql` and `*_create_notifications.sql` add `public.messages` and `public.notifications` to the `supabase_realtime` publication (guarded, so plain Postgres skips it) | Yes | Postgres `LISTEN/NOTIFY` or logical replication feeding the new channel |
| Who receives what | RLS on `messages` (participants only) and `notifications` (the person only) | No | Keep the policy; the new channel must check the same rule |
| Local stack | The `realtime` container must be running (`supabase start` without `-x realtime`) | Yes | — |

Without Realtime the chat still works: sending refreshes the sender's page, and
the other person sees new messages when they reload. The bell likewise
catches up on the next page load. The browser must call
`supabase.realtime.setAuth()` before subscribing, or it joins as anon and
RLS-protected tables are refused.

## Scheduled jobs

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Lapsing unpaid approvals (48 hours) | `src/app/api/cron/expire-engagements/route.ts`, a plain route handler protected by `CRON_SECRET`; it calls `expire_unpaid_engagements()` with the secret-key client | No | Call the URL daily from any scheduler (cron, `pg_cron` with `pg_net`, a GitHub Action) with `Authorization: Bearer $CRON_SECRET` |
| Money checks (daily): settle payouts stuck in `processing`, then record a reconciliation run against Paystack's balance | `src/app/api/cron/money-checks/route.ts` and `src/lib/money-checks.ts`, protected by `CRON_SECRET`; it calls Paystack through `src/lib/paystack.ts` and the database through `src/lib/db/*` | No | Call the URL daily from any scheduler with `Authorization: Bearer $CRON_SECRET`. It answers 500 when any step failed, so alert on that |
| Review deadlines (daily): release submitted work the business didn't review within 7 days, send the 3-day and 1-day review reminders, remove proof files never attached (rows, then the objects in the `work-proof` bucket) | `src/app/api/cron/review-deadlines/route.ts` and `src/lib/review-deadlines.ts`, protected by `CRON_SECRET`; it calls the database through `src/lib/db/submissions.ts` and storage through `src/lib/storage.ts`. Safe to run twice or late | No | Call the URL daily from any scheduler with `Authorization: Bearer $CRON_SECRET`. It answers 500 when any step failed or any hire couldn't be released, so alert on that |
| The schedule | `vercel.json` (`crons`): `expire-engagements` at 03:00 UTC, `review-deadlines` at 03:15 UTC, `money-checks` at 03:30 UTC, `send-emails` at 03:45 UTC | Yes: Vercel Cron | Any of the schedulers above |
| Sending due notification emails (Stage 8): chat emails once their 15 minutes pass, and retries of failed sends | `src/app/api/cron/send-emails/route.ts` and `src/lib/send-emails.ts`, protected by `CRON_SECRET`. Actions, webhooks and the other daily jobs call the same `sendDueEmails()`, so this route is only a backstop. It answers 500 when any send failed | No | Call the URL every minute from any scheduler with `Authorization: Bearer $CRON_SECRET` |
| The per-minute backstop | `supabase/migrations/20261118100100_email_schedule.sql`: a `pg_cron` job `send-notification-emails` runs `public.call_send_emails_route()`, which asks `pg_net` (`net.http_get`) to call the route. The site URL and the bearer secret are read from Supabase Vault (`app_url`, `cron_secret`) at run time. The function does nothing until both entries exist, and the migration skips the schedule where `pg_cron` or `pg_net` isn't available | Yes: `pg_cron`, `pg_net` and Vault are Supabase extensions | Drop the job and the function, and have any scheduler (cron, a GitHub Action, a hosted cron) call the route every minute with the bearer secret. Without it emails still send; only the chat delay and retries wait for the daily Vercel call. Keep the `net` schema out of the exposed API schemas (`api.schemas` in `supabase/config.toml`, and the hosted project's API settings), because `pg_net` queues request headers, including the bearer secret, in `net.http_request_queue` until its worker sends them |

All the routes share one rule (`src/app/api/cron/authorised.ts`): with no `CRON_SECRET`
set, nothing is authorised, so set it in every environment that should run them.

## Build-time only

- **Google Fonts** via `next/font`: downloaded at build time and served from
  our own domain. The build needs internet access; visitors never contact Google.

## Paystack (payments and payouts)

One provider, no abstraction over it (CLAUDE.md §2). Amounts are integer kobo
everywhere, which is also what Paystack uses, so nothing is converted.

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Every call to Paystack: start a transaction, verify a transaction, list banks, resolve an account name, create a transfer recipient, send and verify a transfer, read the balance; and the webhook signature check | `src/lib/paystack.ts`, the only file that calls Paystack. Plain `fetch`, 15 second timeout, no retries; errors never carry the key or a full account number | Yes | Rewrite this file for the new provider, keeping the function names and results. Callers don't change |
| The webhook | `src/app/api/webhooks/paystack/route.ts` (a thin adapter) and `handlePaystackWebhook` in `src/lib/payments.ts`, which checks the signature on the raw body, reads only the event name and reference, then verifies with Paystack | Yes: Paystack's event names, signature header (`x-paystack-signature`, HMAC SHA-512) and payload | Write a new adapter that maps the provider's events onto `confirmCardPayment` and `confirmTransfer`. The rules after that (idempotency, retries) don't change |
| The payment callback | `src/app/(portal)/(business)/business/engagements/[id]/pay/return/page.tsx`: the page Paystack's hosted checkout sends the business back to. It verifies the payment with Paystack server-side (`confirmCardPayment`) before showing a result | Yes: `callback_url` and hosted checkout | Point the new provider's return URL at it; keep the server-side verification |
| Payouts | Paystack Transfer API through `initiateTransfer`, `verifyTransfer`, `createTransferRecipient`, called from the admin approval (`src/app/(portal)/(admin)/admin/money/actions.ts`), the webhook and the daily money check | Yes | A provider with bank transfers and a way to look a transfer up by our reference |
| References we send | `pit_<32 hex>` for a card payment (made by `start_payment()`) and `pit_po_<32 hex>` for a payout (made by `approve_payout()`); the webhook accepts only these shapes | Format only | Keep the formats, or change the two constraints and the two patterns together |
| Environment variable | `PAYSTACK_SECRET_KEY` (server-only, never a `NEXT_PUBLIC_` name). Test and live modes use different keys. Checkout is Paystack's hosted page, so no public key is used | Yes | The new provider's server credential |
| Dashboard setup (once per environment) | Settings, API Keys and Webhooks: set the webhook URL to `https://<your domain>/api/webhooks/paystack` and receive `charge.success`, `transfer.success`, `transfer.failed` and `transfer.reversed`. Test and live modes each have their own URL and key. For payouts to work live, OTP confirmation for transfers must be switched off in the dashboard, or transfers wait for a code nobody will enter | Yes | Equivalent webhook and transfer settings elsewhere |
| What the database depends on | The money functions in `supabase/migrations/20261113*.sql` are plain Postgres (plpgsql, `security definer`, `search_path = ''`) and never call Paystack: the server gives them verified numbers. The only Supabase-specific part is the grants, which name `anon`, `authenticated` and `service_role` (the roles the API uses, as in the Supabase Postgres section) | Partly | Grant the same functions to the app's own roles. Functions that check `current_user_id()` themselves are for signed-in people; the rest are for the server only. Never grant the server-only ones to a role the browser can reach |
| Money settings that are data | `fee_config` (fees, minimum payout, transfer fee tiers, stamp duty, and Paystack's rate for one test) | No | Add a version; rows are never edited |

**How to replace Paystack:** change `src/lib/paystack.ts`, the webhook
adapter and, if the new provider has different reference rules, the two
reference formats above. The ledger, escrow, settlement, payout and
reconciliation rules do not know Paystack exists, except that the ledger's
cash account is called `paystack` and the Paystack fee account
`paystack_fees`; rename those two with a migration if you want the names to
match.

The transfer fee tiers and stamp duty in `fee_config` and `src/lib/fees.ts`
were taken from Paystack's support article on transfers on 2026-11-13. Check
them again against the live rates before launch.

## Resend (transactional email)

Auth emails also go through Resend, but as SMTP configured in Supabase (see
Supabase Auth above). This section covers the notification emails the app
sends itself (Stage 8). One provider, no abstraction over it (CLAUDE.md §2).

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Sending one email | `src/lib/resend.ts` (`sendEmail`), the only file that calls Resend. Plain `fetch` to `POST https://api.resend.com/emails`, 15 second timeout, no retries; the `Idempotency-Key` header is the message's `idempotencyKey`; errors (`ResendError`, with the HTTP status or 0) never carry the API key or an email address | Yes | Rewrite this file for the new provider (or SMTP), keeping `sendEmail(message)` and the `ResendError` it throws. Callers don't change |
| Retrying | The email queue over the `notifications` table, not this file: a thrown `ResendError` leaves the row to be tried again | No | Nothing to change |
| Environment variables | `RESEND_API_KEY` (server-only, never a `NEXT_PUBLIC_` name) and `FROM_EMAIL` (the sender, e.g. `Pitchype <hello@yourdomain>`, on a domain verified in Resend) | Yes | The new provider's credential and a verified sender |
| Dashboard setup (once per environment) | Verify the sending domain (SPF and DKIM) and create an API key limited to sending | Yes | The same domain checks at the new provider |

## PostHog (error reporting)

| What | Where | Provider-specific? | To replace |
|---|---|---|---|
| Reporting server errors: thrown errors (Next.js calls `onRequestError` for every request error) and the money-checks job's failed steps | `src/lib/observability.ts` (`reportServerError`), the only file that calls PostHog; hooked in `src/instrumentation.ts` and `src/app/api/cron/money-checks/route.ts`. Plain `fetch` to `POST <host>/capture/` with one `$exception` event, 5 second timeout, no retries; never throws | Yes | Rewrite `reportServerError` for the new service, keeping its signature. Callers don't change |
| What is sent | Error name, message and stack, scrubbed of email addresses, numbers of nine or more digits and the server secrets. `distinct_id` is the fixed string `server`, and `$process_person_profile` is off: no person profiles, no session replay, no autocapture (none of those are enabled in the client) | Yes | Keep the same limits when replacing it |
| Environment variables | `POSTHOG_PROJECT_API_KEY` (the `phc_` project key; unset means nothing is sent) and `POSTHOG_HOST` (defaults to `https://us.i.posthog.com`; use `https://eu.i.posthog.com` for the EU cloud) | Yes | The new service's key and host |
| Dashboard setup (once per environment) | Create the project, copy the project key, and choose the region when creating it (it can't be moved later) | Yes | The same at the new provider |
