# Deferred work

Setup steps, polish and known gaps we've parked so the stages can focus on the
heavy lifting. Tick items off as they're done and add new ones whenever
something is deferred. "You" means it needs a dashboard, DNS or a decision;
everything else is code.

## 1. Before real people can sign up on the live site

The live database is ready; these are what stand between it and a working
sign-up email. Details: README, "Auth email setup".

- [x] **You:** Resend → add the domain `pitchype.com` and its DNS records; wait
      for "Verified".
- [x] **You:** pick the sender address. The README says `no-reply@pitchype.com`,
      your env file says `noreply@pitchype.com`. Either works; make the README
      match.
- [x] **You:** Supabase → Authentication → Emails → SMTP: host
      `smtp.resend.com`, port `465`, user `resend`, password = Resend API key,
      sender name `Pitchype`.
- [x] **You:** Supabase → Emails → Templates: paste
      `supabase/templates/confirmation.html` ("Confirm your Pitchype account")
      and `recovery.html` ("Reset your Pitchype password").
- [x] **You:** Supabase → URL configuration: Site URL
      `https://pitchype.com`; add every other address the app runs on
      (Vercel previews, `http://localhost:3000` for local production builds)
      to Redirect URLs.
- [x] **You:** Supabase → Sign in / Providers → Email: "Confirm email" on,
      minimum password length 8. Then raise "emails sent per hour" under Rate
      limits.
- [ ] Sign up with a real inbox on the live site, confirm, finish onboarding.

## 2. Deploying to Vercel

Details: README, "Deploy to Vercel".

- [ ] **You:** import the repo in Vercel; Functions region **Frankfurt
      (fra1)**.
- [ ] **You:** environment variables for Production (and Preview):
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
      `NEXT_PUBLIC_APP_URL`, and `SUPABASE_SECRET_KEY` (Supabase → API keys;
      mark it sensitive). Without the secret key, everything but photo
      uploads works.
- [ ] **You:** domain `pitchype.com` (apex redirects to www), matching
      `NEXT_PUBLIC_APP_URL`.
- [ ] After the first deploy, check `/robots.txt`, `/sitemap.xml`, the
      waitlist, a sign-up, and a photo upload.
- [ ] **You (optional):** add the live `SUPABASE_SECRET_KEY` to
      `.env.production.local`, only if you run production builds locally.

## 3. Before launch (opening sign-up to the public)

- [ ] **You:** send `docs/legal/` (README with the questions, `terms.md`,
      `privacy.md`; drafted 2026-11-17) to a Nigerian fintech and data
      lawyer, then swap the approved text into the two pages.
- [ ] **You, now urgent:** sign-up is linked from the site (2026-11-10), but
      the privacy notice and terms still say "draft, covers the waitlist
      only". They must cover accounts, public creator profiles and photos,
      verification and reports, reviewed by a lawyer. Then drop the draft
      banner and `noindex`, and add them to the sitemap.
- [ ] **You:** name PostHog as a processor in the privacy notice (error reports
      go to PostHog, see `docs/PROVIDERS.md`), and have the lawyer review the
      cross-border transfer. Then create the PostHog project and set
      `POSTHOG_PROJECT_API_KEY` and `POSTHOG_HOST` in Vercel.
- [ ] **You:** confirm the `hello@pitchype.com` inbox exists. It's in the
      footer and in the message hidden creators see (`src/lib/site.ts`).
- [x] Link sign-up and login from the site; swap the "Join the waitlist"
      buttons (header, directory, creator pages) for sign-up. Done
      2026-11-10; the waitlist form is gone.
- [ ] Link `/creators` from the site nav, and list it in the sitemap even
      when empty.
- [ ] **You:** create the first admin accounts (sign up, then the SQL in the
      README).
- [ ] **You, now:** email everyone on the waitlist that sign-up is open
      (export from the `waitlist` table). Then decide whether to keep or
      delete the table.
- [ ] **You:** legal structure for holding escrow funds in Nigeria (CLAUDE.md
      §6 compliance flag). Stage 6 is built and runs in test mode only; this
      is needed before live money (see section 12).
- [ ] **You:** Supabase Pro and Vercel Pro (backups, point-in-time recovery,
      no cold pauses). Planned for Stage 9.

## 4. Quality and tooling

- [x] CI: `.github/workflows/ci.yml` runs lint, type-check, unit tests and
      build, and pgTAP against a fresh local Supabase, on every PR and push to
      `main` (added 2026-11-18, Stage 9), plus a production `npm audit` (high and
      critical) and the Playwright job. Still to do: make it a required check
      on `main`; add `scripts/money-race.mjs`.
- [ ] Formatting: `npm run format:check` fails on 16 files. Format them in one
      commit with no logic changes, then add `format:check` to CI.
- [x] Browser end-to-end tests: Playwright (`@playwright/test` 1.65.1, pinned) in
      `e2e/`, run by `npm run test:e2e` and in the CI `e2e` job against the local
      Supabase stack. Smoke tests at desktop and 390px. Added 2026-11-18, Stage 9.
      Still to do: the signed-in flows (hire, submit, dispute, payout) need test
      accounts and seed data.
- [ ] Try photo upload on real phones: iPhone (HEIC photos), Android, slow
      mobile data.
- [ ] Update the Supabase CLI (2.65 → 3.x).
- [ ] Delete the merged branches `stage-1-landing` and `stage-2-auth`.
- [x] `RESEND_API_KEY` and `FROM_EMAIL` stay in the env files: Stage 8's own
      emails use them (`src/lib/resend.ts`).

## 5. Small follow-ups from Stage 3

- [x] Notifications (Stage 8): email creators when verified, rejected or
      hidden (built 2026-11-18, always sent).
- [ ] Remind creators to re-verify every few months. Tell admins about new
      verification requests and reports (today they check `/admin`; see
      "admin notifications" in §11).
- [ ] The directory lists newest profiles first. Revisit with a fair ranking
      and the "Featured" rules (CLAUDE.md §10).
- [ ] Two accounts can list the same handle as self-reported (only verified
      handles are unique). Consider flagging duplicates to admins.
- [ ] Spot phone numbers and emails in bios (anti-leakage, CLAUDE.md §10).
- [x] Rate limits are shared across server instances: each attempt is a row in
      `rate_limit_hits`, counted by `consume_rate_limit()` (migration
      `20261118100200`, Stage 9; `src/lib/db/rate-limits.ts`). Rows older than
      their window are deleted when their key is checked. Still to do: a
      scheduled sweep for keys that are never checked again (cheap to add to a
      daily job).
- [ ] Profile pages stream their meta description to Googlebot (Lighthouse
      SEO 91; Google handles it). Revisit if search results look wrong.
- [ ] Automated verification through official APIs (YouTube Data API, TikTok
      Login Kit, Instagram Graph API). Never scraping.
- [ ] Creators can't change their page address (slug). Add if asked.
- [ ] Niches are added with SQL. Build an admin screen if it becomes
      frequent.
- [ ] Portfolio galleries.
- [ ] Supabase's security check warns about functions callable through the
      API. They're intended, but `current_user_id`/`current_user_role` could
      move out of the API schema to quiet two of them.

## 6. From Stage 4 planning (campaigns)

Decisions: `docs/campaign-spec-decisions.md`.

- [ ] Campaign images: none for now. Later, one product photo reusing the
      profile photo pipeline; a business logo is the cheaper first image.
- [x] Pay-per-click campaigns (design
      `docs/superpowers/specs/2026-11-18-pay-per-click-design.md`, goal
      2026-11-30). Part 1 done 2026-11-19: per-click terms, tracked links,
      click recording and filtering, counts on the hire and campaign pages.
      Part 2 done 2026-11-20: settlement (fee on spent, floors), the 72-hour
      hold and settle-clicks cron, withdrawal, cancel, disputes during the
      hold, proof for the record, notifications, per-click wording. Part 3
      done 2026-11-21: clicks per day and by source, the end-of-campaign
      summary, the business CSV, admin click views, and the end-date lock
      once clicks stop.
- [ ] **You:** set `CLICK_HASH_SECRET` (`openssl rand -hex 32`) on Vercel
      Production and Preview before any per-click campaign goes live; don't
      change it while a campaign runs. Don't push the pay-per-click
      migrations to the hosted project until Part 2 is merged.
- [ ] Pay-per-click follow-ups after launch: a "pay for all approved
      creators" button, destination domain verification (a DNS TXT code)
      replacing admin review, a Google Safe Browsing check, a daily click
      rollup if the dashboards get slow, and the business applications list
      saying "budget" rather than "your price" on per-click campaigns.
- [ ] **You:** decide the banned campaign types for the terms (gambling and
      betting are the open question; CLAUDE.md §12, open item 10). The
      pay-per-click numbers (item 11) were decided 2026-11-18.
- [x] Check Paystack's current transfer fees on small payouts before setting
      the minimum payout and minimum cost per click. Done 2026-11-13: tiers and
      the ₦50 stamp duty are from Paystack's support article (`src/lib/fees.ts`);
      the minimum payout is ₦1,000. Recheck the live rates before launch
      (section 12); the pay-per-click minimum cost per click is still open.
- [ ] Spot phone numbers and WhatsApp links in campaign briefs (same check
      as for bios above).

## 7. From building Stage 4

- [ ] Field ids come from field names. Next keeps recently visited pages in
      the DOM (hidden), so the new-campaign and edit forms can briefly sit on
      one page with the same ids. Labels pointed at the right field in
      testing, but switching the form components to React's `useId` would
      rule it out.
- [x] Signed-in pages have no navigation bar (done in the portal UI pass:
      sidebar, top bar and phone drawer).
- [ ] Tell existing applicants when a live brief changes (applicants exist
      since Stage 5; Stage 8 sends the notification). The history is already
      kept in `campaign_revisions`.
- [x] From Stage 5, stop places dropping below the number of accepted
      creators (in `campaigns_before_write`). Done in Stage 5: places can't
      drop below the hires held.
- [ ] Admins aren't alerted to first campaigns waiting for review or to new
      campaign reports (Stage 8); they check `/admin`.
- [ ] Eligibility is worked out per campaign per creator on every list; add
      caching or a precomputed table if campaigns or creators grow into the
      thousands.
- [ ] The landing page's open-campaign count refreshes hourly.

## 8. From the portal UI pass

Design: `docs/superpowers/specs/2026-11-09-portal-ui-design.md`.

- [ ] Collapse the sidebar to icons once Inbox and Wallet make it longer
      (Stage 5 and 6).
- [x] Notification bell in the top bar. Built 2026-11-11 (in-app, live); emails
      off the same table are Stage 8.
- [ ] Signed-in pages need JavaScript: their content streams in behind
      Suspense, so without it they stay on the loading message. True since
      Stage 2; revisit only if no-JS visitors matter.
- [ ] The campaign form's spend summary is still a cream box; restyle with
      the form if it changes.

## 9. From the "porcelain and aurora" redesign (2026-11-10)

Design: `docs/DESIGN_SYSTEM.md` and CLAUDE.md §4a.

- [ ] **You:** click through every signed-in page as a business, a creator
      and an admin, on a phone and a desktop. The landing page, sign-up,
      log-in, one onboarding step and the business home were checked in a
      browser with sample data; the other portal pages only picked up the new
      tokens, `panel` cards and shell, unseen.
- [ ] Firefox doesn't run scroll-driven animations yet, so `reveal` content
      simply appears there. Fine as is; nothing to do unless that changes.
- [ ] Swap the drawn hero window for a real product screenshot or short
      recording once the Stage 5–6 screens exist (optional).
- [ ] Dark mode isn't designed. The tokens would carry it; only build it if
      people ask.
- [ ] The outside figures (`src/components/landing/stats.tsx`, shown on
      `/for-business` and `/for-creators`) were checked on 2026-11-10. Recheck them every few months (TikTok's
      Creator Rewards countries change), and replace them with Pitchype's
      own numbers once there are enough.
- [ ] Next for the landing page argument, from the positioning notes:
      creator performance analytics (reach, clicks, earnings per campaign) so
      "measurable" can be claimed with our own data.
- [ ] Audience pages (2026-11-18): `/for-business` and `/for-creators` are
      built and the home page is a front door that links to them. When UGC
      (or any new product) ships, add a section to the right page and a line
      to the home page's `AudienceSplit`; don't mention it before it exists.
      Design: `docs/superpowers/specs/2026-11-18-audience-pages-design.md`.
- [ ] Audience pages: the "How it works" steps on each page are the same four
      steps as the home page's tabs. If the product grows, give the pages
      their own, deeper steps. The home page's bento `Features` section was
      left as it is (its tiles serve both sides).
- [ ] `ChoiceGroup`'s `pills` variant lost its only user with the waitlist
      form. Remove it if nothing needs it by the next design pass.
- [ ] `docs/design-inspiration-clay.md` still describes the old cream look;
      rewrite or archive it when convenient.

## 10. From building Stage 5 (applications, chat, account standing)

Design: `docs/superpowers/specs/2026-11-10-stage-5-applications-chat-design.md`.

- [ ] **You:** push the Stage 5 migrations (and Stage 4's, if still unpushed) live,
      and set `CRON_SECRET` in Vercel (the daily lapse job needs it).
- [ ] Strikes never expire; only an admin removing one lowers the count.
      Revisit with real data (for example, strikes older than a year stop
      counting).
- [ ] Blocking hides nothing in lists: a creator who blocked a business
      still sees its campaigns. Hide them if people ask.
- [x] Stage 6: a suspended account keeps what it's owed. Payouts carry on;
      any hold must be per payment, with a written reason (spec, "Money").
      Done in Stage 6: payouts and running work are unaffected by suspension,
      and there are no payment holds.
- [x] Stage 6: store that the business saw the non-refundable fee notice on
      the pay page (CLAUDE.md §6.2). Done in Stage 6: `payments.fee_notice_seen_at`
      and, for cancels, `engagements.cancel_fee_notice_seen_at`.
- [x] A hire that lapsed or was cancelled before payment can't be re-made for
      the same application. Fixed 2026-11-14: the lapse now shows everywhere the
      moment the deadline passes, and the creator can apply again on the same
      application (`20261114100000_lapse_and_reapply.sql`). The business can also
      hire them again or pass, from the "To decide" tab, and a lapsed hire no
      longer reads as a filled place under "Hired"
      (`20261114100100_rehire_after_lapse.sql`).
- [ ] Business home: show new applications waiting for a decision (today the
      campaign table shows the counts).
- [ ] Admin decisions on standing show no confirmation when the row leaves
      the list (lifting a suspension, answering an appeal). The list
      changing is the confirmation; add a toast when toasts arrive.

## 11. From the notifications bell (2026-11-11)

- [x] Stage 8: email off the `notifications` table (Resend), with
      per-person preferences; money-critical ones always send (CLAUDE.md §8).
      Built 2026-11-18: queue columns on `notifications`, three switches in
      `notification_preferences`, sent right after actions and by the
      backstop routes.
- [ ] **You:** add `RESEND_API_KEY` and `FROM_EMAIL` to `.env.production.local`
      and to Vercel (Production and Preview). The domain is already verified
      in Resend.
- [ ] **You:** in Supabase (SQL editor) add the two Vault secrets the
      per-minute backstop reads: `select vault.create_secret('<live site URL>',
      'app_url');` and `select vault.create_secret('<same value as
      CRON_SECRET>', 'cron_secret');`. Until both exist the job does nothing.
- [ ] **You:** push migrations `20261118100000` (email queue) and
      `20261118100100` (email schedule) to the live project. Ask first.
- [ ] **You:** after pushing, check the job exists: `select jobname from
      cron.job;` must show `send-notification-emails`. A failed `create
      extension` or `cron.schedule` on hosted only prints a NOTICE during
      `db push`, and without the job chat emails wait for the 03:45 UTC daily
      call.
- [ ] **You:** when `CRON_SECRET` rotates, update the Vault secret too: find
      its id with `select id from vault.secrets where name = 'cron_secret';`,
      then `select vault.update_secret('<id>', '<new secret>');`. Otherwise
      the backstop gets 401 and fails silently.
- [ ] **You:** prune `cron.job_run_details` periodically (about 1,440 rows a
      day; `pg_cron` never prunes it), for example `delete from
      cron.job_run_details where end_time < now() - interval '14 days';`.
- [ ] **You:** send one test email on the live site (for example send a chat
      message to a second test account and wait 15 minutes) and check the
      inbox and the spam folder.
- [ ] **You:** the email's logo header is `public/email/header.jpg`, served
      from the site itself, so it shows only after this branch is deployed
      (until then mail apps show the "Pitchype" text in its place). It was
      rendered once from the brand mark and Bricolage Grotesque over the
      aurora tints; if the logo changes, render it again at 1200 x 296.
- [ ] **You (local development):** blank `RESEND_API_KEY` in `.env.local`, or
      use a Resend test key, so local test accounts don't get real emails.
      Clear the local queue with `update public.notifications set
      email_due_at = null where emailed_at is null;`: run it before starting
      a dev server on this branch, and after running `scripts/money-race.mjs`
      (the script already clears its own people's rows at the end).
- [ ] Paid features: paid campaign-alert emails and "Featured" placement
      (CLAUDE.md §10) are not built; they need the entitlements check.
- [x] Stage 7: add kinds for submissions and auto-release (a trigger plus a
      case in `src/lib/notifications.ts`). The payment, work started, paid
      cancellation, settlement and payout kinds were added in Stage 6.
- [ ] The bell shows the latest 20. Add a full `/notifications` page if
      people need older ones.
- [ ] Notifications are never deleted. Prune read ones after a few months
      once the table grows.
- [ ] Admin notifications: admins have no bell and get no email; they check
      `/admin`. Notify them of new verification requests, reports and first
      campaigns.

## 12. From building Stage 6 (money)

Design: `docs/superpowers/specs/2026-11-13-stage-6-money-design.md` (§13 lists
where the build differs). Stage 6 runs in Paystack test mode only.

Before any real money (in this order):

- [ ] **You:** set `PAYSTACK_SECRET_KEY` (the live key) and `CRON_SECRET` in
      Vercel, as sensitive variables. Without `CRON_SECRET` neither daily job
      runs; without the key nobody can pay or be paid.
- [ ] **You:** push the Stage 6 migrations to the live project (nine files,
      `20261113100000` to `20261113100600`, plus Stage 4 and 5's if still
      unpushed). Steps and rules: README, "Pushing migrations to the live
      database". Take a backup first and read the dry-run list.
- [ ] **You:** in the Paystack dashboard set the webhook URL to
      `https://pitchype.com/api/webhooks/paystack` with the events
      `charge.success`, `transfer.success`, `transfer.failed` and
      `transfer.reversed`, and switch OTP confirmation for transfers off
      (live payouts cannot work with it on). Real webhook delivery has never
      been exercised: it needs a public URL.
      Seen on 2026-11-14: a ₦23,750 test payout was approved and Paystack
      held the transfer at status `otp` (it waits for a code), so it stayed
      `processing` and the money stayed in "payout in flight" while nothing
      reached the bank. The app handled it correctly; the dashboard setting
      is the only fix. In test mode, switch OTP off, or finish that transfer
      in the dashboard, then press **Check with Paystack** on
      `/admin/money/payouts`.
- [ ] **Build (next build):** an admin "Confirm with OTP" button on
      `/admin/money/payouts` for a payout Paystack holds at `otp`. The admin
      types the code Paystack sent, and a server action calls Paystack's
      `transfer/finalize_transfer` with the transfer code and the OTP. Needs:
      the admin-only check, the OTP never stored or logged, a rate limit,
      a test that a non-`processing` payout is refused, and a note in
      PROVIDERS.md (it is a Paystack endpoint). Only needed if OTP stays on
      for live transfers; if it is switched off in the dashboard, this can
      wait.
- [ ] **You:** legal review of holding third-party funds and paying them out
      (CLAUDE.md §6 compliance flag; same item as in section 3). Nothing here
      should go live before it.
- [ ] **You:** roll the Paystack TEST key that was shared in chat while this
      stage was being built (Paystack dashboard, API keys), then update
      `.env.local`.
- [ ] **You:** click through every Stage 6 screen as a business, a creator and
      an admin, on a phone and on a desktop, with the seeded
      `@e2e.pitchype.test` users. **This has not been done.** The signed-in
      browser run did not happen in the build (the Chrome extension was never
      connected), so the pay, return, wallet, job, payout and admin money
      screens are unverified in a real browser. Only signed-out routes, a
      signed webhook, the unit and database tests and the race script were
      run.
      Since then (2026-11-14) you paid one hire by hand with the test card:
      the lapse and hire-again path, the pay page, the return page, funding
      and the creator's Start work all worked (checked in the database, see
      the next item). Wallet, payout and admin money screens are still
      unclicked.
- [ ] **You:** recheck Paystack's transfer fee tiers and the ₦50 stamp duty
      against the live rates before launch (`src/lib/fees.ts`, the `fee_config`
      seed). The stamp-duty source article was not independently verified.

### Before real money (from the final whole-branch review, 2026-11-13)

Release blockers. Each must be done, or consciously waived by you, before a
live key is set.

- [ ] **You:** Paystack's settlement mode must keep collected money in the
      Paystack balance. By default Paystack pays collections out to the bank
      account; if so, every reconciliation shows a large difference and payouts
      fail for lack of balance. Configure it, or model settlements in the ledger.
- [ ] **You:** "Pass transaction charges to the customer" must be OFF in
      Paystack. Otherwise Paystack's verified amount includes the charge, every
      payment is a `mismatch`, and money is collected without funding the hire.
- [ ] **Build:** a correction/adjustment tool with a required reason. The
      `correction` event type exists but nothing can post a reversing group
      (needed to book a mismatched payment, a `transfer.reversed` after `paid`,
      or a hand refund of a business wallet). Money-critical SQL: design and
      review it first.
- [ ] **Build:** durable admin alerts for `needs_review` and `mismatch` card
      payments (today one log line each), a non-zero reconciliation difference
      (today a callout on `/admin/money`) and payouts waiting for approval
      (admins have no bell).
- [ ] **You/Build:** a real webhook run on a deployed preview with test keys:
      pay, settle, pay out, and a reconciliation run showing zero difference
      (spec §12 lists this test; it never ran).
- [ ] **You:** confirm what Paystack's `fees` field contains (is VAT
      included?) and that one real transfer costs exactly the tier fee plus
      stamp duty. One test-mode card payment so far: ₦26,250 charged, `fees`
      49,375 kobo, which is exactly 1.5% + ₦100 with no VAT, so in test mode
      the field excludes VAT. Confirm the live account reports the same.
      The transfer part is still unchecked. A transfer-fee difference is not booked to `paystack_fees`; it
      shows only as a reconciliation difference.

Parked from the final review (not release blockers on their own):

- [ ] `confirmTransfer` does not compare Paystack's returned reference and
      amount with the payout.
- [ ] The ledger CSV export pages by offset while ordering newest first, so
      rows inserted during an export shift pages.
- [ ] The pay page shows fees from TypeScript constants, not `fee_config`; the
      first new `fee_config` row will make it disagree with `start_payment`
      (the `payout_paid` notification's net amount has the same dependency).
- [ ] `recipient_code` is readable by its owner through RLS; restrict it with
      column grants.
- [ ] Consider running the money-checks job more often than daily: a failed
      transfer call can wait up to 24 hours (an admin can now press **Check
      with Paystack** meanwhile).

Product and code follow-ups:

- [ ] Business wallet withdrawal to a bank (CLAUDE.md §12, open item 9).
      Today an admin refunds by hand on request.
- [ ] A "reversal after paid" correction and the durable admin alerts: moved
      to "Before real money" above.
- [x] The `paid_out` engagement status is unused (payouts come from the
      wallet). Decided in Stage 7: it stays in the enum, unused (dropping an
      enum value means rebuilding the type).
- [ ] Cache `listBanks()`; it runs uncached, up to five pages, on every form
      render, name check and save.
- [x] Rate limits (bank checks, payout requests) are shared now, like the
      others (section 5, Stage 9).
- [x] Stage 7 must call `settle_engagement_internal` for accept, auto-release
      and disputes, skip the actor in `engagements_money_notify`, and widen
      settlement to `submitted` and `disputed`.

Deferred from Stage 7:

- [x] Email for the Stage 7 notices (work submitted, denied, review
      reminders, auto-release, dispute opened/statement/withdrawn, decision).
      Built in Stage 8 (2026-11-18); all always send.
- [ ] Build the hire terms snapshot decided in
      `docs/campaign-spec-decisions.md` (accepted creators keep the terms they
      agreed to). Stage 7 shows the current campaign, which is safe only
      because price, requirements and deliverables are locked once live.
- [ ] Move a campaign to `completed` once all its hires are settled. Stage 7
      does not change campaign status.
- [ ] Auto-release runs in one transaction per cron run, so a statement
      timeout would roll back a whole backlog. Batch or cap
      `release_overdue_submissions()` if volume grows.
- [ ] A hire whose auto-release keeps failing is visible only in the database
      log and as a daily 500 from `/api/cron/review-deadlines`. Surface it on
      `/admin/money`.
- [ ] Race scenarios 16 to 21 in `scripts/money-race.mjs` are timing
      dependent: scenario 18 sometimes sees only one winner order, and the
      delays are tuned to one machine. Make them wait on locks instead of
      sleeping if they start to flake.
- [ ] Submission notes and denial reasons aren't checked for contact details
      (only dispute text is, in the database). The owner's call; decide before
      launch whether they should be.
- [ ] Accepting during a dispute overwrites the denied round's `decided_at`
      (the denial time is lost). Keep the denial time if it ever matters.
- [ ] A dispute can be opened, withdrawn and reopened repeatedly; this is
      only rate-limited (5 opens a day), not capped per hire.
- [ ] The business hire page lists the pending round twice (under "Work to
      review" and "All rounds of work") when there is more than one round.
- [ ] `/admin/money/escrow` shows an exact count of hires holding escrow but
      no total held across them.
- [ ] A proof object can be orphaned for good if its storage delete fails
      after the database row is gone; there is no job to find it, so clean up
      by hand (compare the `work-proof` bucket against `proof_files`).

Deferred minors, database:

- [ ] `settle_money` counts a missing funding payment as no Paystack charge
      instead of raising (only hand-made data can reach it).
- [ ] `reject_payout` records the reason but not who rejected or when.
- [ ] `admin_ledger`'s date filter casts `created_at` per row, so it cannot
      use an index; fine at current volume.
- [ ] `save_bank_account` has no callers and no grant to any role (the
      service role's went in `20261113100600`); drop it in a later migration.
- [ ] `record_card_payment` payloads are not scrubbed in SQL (the server
      trims them); revisit if bank-transfer or USSD channels are enabled.
- [ ] The header comment of `20261113100200` still describes the old fault
      refund charge sum; `20261113100250` replaces it (applied migrations are
      not edited).
- [ ] A payment started at the very instant of `pay_by` can be stranded into
      the business wallet instead of funding (no money is lost).
- [ ] A comment that the `engagement_settled` notification guard relies on
      admin settlements having a null `cancel_reason`; the wallet-only
      `hire_funded` notification path is untested; the split-outcome notice
      wording is clumsy.

Deferred minors, Paystack and the webhook:

- [ ] `listBanks()` silently stops after five pages.
- [ ] Test gaps in `paystack.test.ts`: a bad reference on `verifyTransfer` and
      `initializeTransaction`, bad bank details on `createTransferRecipient`,
      and the `Authorization` and `Content-Type` headers on POSTs.
- [ ] The money-checks job logs only the error class and status, not the
      database error code; its stuck-payout lookup is capped at 100 and the
      response does not show that more remain; a very large backlog of
      sequential Paystack calls could outlast the default function duration
      (set `maxDuration` if that happens).
- [ ] A revisit of the payment return page after a stranded payment, while
      another payment funded the hire, says "Payment received" and is silent
      about where this payment went.

Deferred minors, screens:

- [ ] The pay button's amount is computed when the page loads; the real
      amount is confirmed at Paystack.
- [ ] A failed `initializeTransaction` leaves an `initiated` payment that
      blocks cancel and the lapse for 30 minutes (a retry supersedes it).
- [ ] The Server Actions for money have no unit tests (they are thin; the
      database enforces the rules).
- [ ] A lapsed `awaiting_payment` hire's total row is still labelled "You pay".
- [ ] The payout amount box and the admin amount parser accept loose comma
      grouping (`10,00`, `1,2,3`).
- [ ] The admin payouts list is not capped in code, but the API returns at most
      1,000 rows, so past 1,000 waiting payouts the list and the exact count
      disagree; "recently decided" is sorted by request time, not decision
      time; a stale admin tab is not refreshed after an "already settled"
      message.
- [ ] Two admins settling the same way at once both see "Settled", and only
      the first reason is kept.

Deferred minors, scripts and tooling:

- [ ] The race script's pair "flip" changes only the spawn order (a warning
      covers one-sided results), and killing the `docker exec` client does not
      kill the server session (the statement timeout bounds it).
- [ ] The local ledger holds permanent rows from the race script (emails ending
      `@race.pitchype.test`, about ₦11.5M in total); the ledger is append-only,
      so they stay until the local database is reset. The admin reconciliation
      screen shows a large difference locally because of them and of the
      Paystack test balance.
- [ ] Eight files already fail `prettier --check`, from before Stage 6.

Portal rebuild (2026-11-16, the dashboard-kit look):

- [x] Rendered against the local database on 2026-11-16 (read-only page
      loads as existing local accounts, headless Chrome screenshots): both
      home pages at 1440px, the creator home and work board at 390px, both
      boards, the creator wallet. `listMyHires` returns a business's hires
      under RLS. Not exercised: the phone drawer, anything that needs a click.
- [x] Deeper pass on the remaining pages (2026-11-16): both campaign detail
      pages, the hire and job pages (two columns), the campaign form (titled
      cards), the applicants page (spacing, breadcrumb). Seen in headless
      Chrome at 1440px, and the creator's campaign page at 390px. The pay page
      was deliberately left as a narrow checkout.
- [x] Lists, filters, tables and the admin split (2026-11-16): one pager
      (`Pagination`, `lib/paging.ts`) on every list, a slimmer `FilterBar`,
      `FilterTabs`, one table look (`TABLE`), tabs on a business's campaign
      list, and the admin area as one page per job (see the design system,
      "Admin pages"). Seen in headless Chrome at 1440px, and the campaign
      list and directory at 390px.
- [ ] Paging is done in the app for lists the data layer returns whole
      (a business's campaigns, inbox, applicants, wallet history, payouts,
      admin queues, escrow, reconciliation runs); those reads are capped at
      100–200 rows, so anything older than the cap is not reachable yet.
      Move each to a paged query (limit and offset with a count) when a real
      account gets near its cap; the creator campaign list, the directory and
      the admin ledger already page in the database.
- [ ] The admin overview and `/admin/money` read whole queues only to count
      them. Replace with count queries if the admin pages get slow.
- [x] Search and new cards (2026-11-16): a search box on Find creators
      (name, city, state, niche) and on a creator's campaign list (title, brief,
      business), and redesigned creator and campaign cards. Migration
      `20261116100000_search_text.sql` is applied locally only; pgTAP tests
      added to `creator_directory_rls` and `campaigns_rls`.
- [ ] Push `20261116100000_search_text.sql` to the hosted project with the
      other unpushed migrations. Until then the hosted app's creator and
      campaign lists fail, because the app now passes `search`.
- [ ] Search is a plain substring match (`ILIKE`) with no index. Fine for
      hundreds of rows; add a trigram index (`pg_trgm`) if the lists get slow.
- [x] Landing page (2026-11-16): the hero illustration now draws the
      rebuilt portal (grouped sidebar, figures, the hiring board) instead of
      the old campaign screen. Seen at 1440px, 820px and 390px. The public
      `/creators` page's new filter toolbar was seen at 1440px too.
- [ ] The landing page's other sections still describe the product without
      the hiring board (How it works, the feature tiles). Decide whether the
      board deserves its own tile or step.
- [x] The pages not looked at before (2026-11-16): the live-campaign edit
      form, account standing, the inbox thread (one card: messages over the
      composer), the admin page (queue counts, one titled card per queue) and
      the admin money overview (two figures at the top). The business's
      campaign list lost its second "New campaign" button, and the top bar
      now names the section on hire, pay, job and account-standing pages.
      Seen in headless Chrome at 1440px; the thread and the admin page also
      at 390px. Looked at and left as they are: the inbox list, both creator
      directory pages, the creator's campaign list, pay-return (breadcrumb
      only), and the admin payouts, ledger and money-trail pages.
- [ ] Not seen with data: a draft campaign's edit page, the pay-return
      page (it needs a real payment reference), and the admin queues with
      anything in them (every local queue was empty).
- [ ] The admin money-trail page (`/admin/money/engagements/[id]`) still
      uses plain section headings, not titled cards.
- [ ] The boards (`/business/board`, `/applications`) render correctly, but
      no card has been dragged or clicked in a browser, and no local account
      had a card in Applied, Shortlisted, To pay or Ready to start. Check
      dragging in Chrome, Safari and Firefox (Applied →
      Shortlisted, a drop on To pay opening the Hire dialog, a creator's
      Ready to start → In progress), the phone tabs, and a keyboard-only
      pass.
- [ ] The hiring board's "All campaigns" view calls `campaign_applications`
      once per campaign (capped at 12). Replace with one database function
      returning a business's applications across campaigns, with a pgTAP
      test, when the local database is running.
- [x] Board columns for submitted work and review, with Stage 7.
- [ ] Sidebar count next to "Campaigns" (creators: open campaigns they
      qualify for; businesses: applications to decide) and tabs (All, Live,
      Drafts) on the home page's campaigns table: both were in the mockup and
      left out, because each needs data in the shell or client state.
- [ ] A business's home has no list page behind "In progress" and
      "Completed" yet, so those two pipeline stages are not links.
- [x] Pay per click is live in production. The For businesses page has a
      pay-per-click section and FAQ, and the For creators page covers how
      those campaigns pay (2026-11-22).
- [x] Onboarding copy and the privacy and terms drafts now describe the live
      product, not the waitlist (2026-11-22). Both stay drafts, noindex, for
      lawyer review.
- [ ] Privacy notice: the rate limiter stores each request's IP address in
      `rate_limit_hits`, and old rows are only removed when the same address
      tries again. Decide whether to purge them on a schedule, then state the
      answer in the notice (2026-11-22).
- [ ] Privacy and terms: set the retention period for payment, ledger, payout
      and dispute records, which the notice says is still being set.
- [ ] Landing copy: check the pages at 390px in a real browser. The
      headless screenshot used on 2026-11-22 crops the right edge of every
      page, including the unchanged privacy page, so it could not confirm the
      new hero wrap.
- [x] Pay-per-click rate guidance, phase 1 (2026-11-22): the campaign form's
      spend summary shows clicks needed per creator and what a creator keeps
      after our fee, and warns at the ₦50 minimum (`perClickGuidance()` in
      `src/lib/campaign.ts`). It states no market rate on purpose: the only
      Nigerian figures found were one agency blog (Meta, about ₦30–₦300 a
      click, by objective) and one unofficial guide, with nothing by niche or
      platform, which CLAUDE.md §3 doesn't let us ship as a statistic.
- [x] Pay-per-click rate guidance, phase 2 (2026-11-22): creators propose their
      own cost per click, businesses compare and approve the rate they saw,
      and the hire's rate is frozen on the engagement. Design:
      `docs/superpowers/specs/2026-11-22-per-click-creator-rates-design.md`.
- [ ] Phase 2 follow-ups: tell the business when a creator changes their rate
      after applying (only the first application notifies today); decide
      whether the business can counter a creator's rate (today it hires at it
      or passes); and push migration `20261126100000` to the live project with
      the app (production has no per-click campaigns yet).
- [ ] Merge order: `apply_to_campaign()` and `approve_application()` carry
      identity checks on other branches, and this change leaves both alone on
      purpose. Whoever merges those branches should confirm the apply and
      hire flows still work end to end, and that
      `20261126100000` sorts after every migration that redefines the click or
      application functions it replaces (`campaign_applications`,
      `my_applications`, `engagement_json` and the click functions).
- [ ] Pay-per-click rate guidance, phase 3: a typical-rate band from our own
      completed hires, by niche and platform, shown only above a sample size
      the owner sets, as aggregates that never expose one business's rate. The
      form says "We don't show a typical rate for your niche yet" until then.
- [ ] Open from 2026-11-22: whether to raise the ₦50 minimum cost per click
      (CLAUDE.md §12 item 11) now that businesses can choose the floor.

## Done

- [x] Database migrations for Stages 1–3 pushed to the live project
      (2026-11-09), with the `profile-photos` bucket.
