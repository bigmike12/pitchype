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
      `https://www.pitchype.com`; add every other address the app runs on
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
- [ ] **You:** domain `www.pitchype.com` (apex redirects to www), matching
      `NEXT_PUBLIC_APP_URL`.
- [ ] After the first deploy, check `/robots.txt`, `/sitemap.xml`, the
      waitlist, a sign-up, and a photo upload.
- [ ] **You (optional):** add the live `SUPABASE_SECRET_KEY` to
      `.env.production.local`, only if you run production builds locally.

## 3. Before launch (opening sign-up to the public)

- [ ] **You, now urgent:** sign-up is linked from the site (2026-11-10), but
      the privacy notice and terms still say "draft, covers the waitlist
      only". They must cover accounts, public creator profiles and photos,
      verification and reports, reviewed by a lawyer. Then drop the draft
      banner and `noindex`, and add them to the sitemap.
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

- [ ] CI: a GitHub Actions workflow running lint, type-check, unit tests and
      the database tests on every PR. There is none yet; everything is run by
      hand before each PR.
- [ ] Keep the browser end-to-end tests in the repo. Today they're throwaway
      scripts, run by hand each stage. Playwright would be a new dev
      dependency (decide first).
- [ ] Try photo upload on real phones: iPhone (HEIC photos), Android, slow
      mobile data.
- [ ] Update the Supabase CLI (2.65 → 3.x).
- [ ] Delete the merged branches `stage-1-landing` and `stage-2-auth`.
- [ ] Remove the unused `RESEND_API_KEY` and `FROM_EMAIL` from the env files
      (Supabase sends auth email), or keep them for Stage 8's own emails.

## 5. Small follow-ups from Stage 3

- [ ] Notifications (Stage 8): email creators when verified, rejected or
      hidden; remind them to re-verify every few months; tell admins about
      new verification requests and reports (today they check `/admin`).
- [ ] The directory lists newest profiles first. Revisit with a fair ranking
      and the "Featured" rules (CLAUDE.md §10).
- [ ] Two accounts can list the same handle as self-reported (only verified
      handles are unique). Consider flagging duplicates to admins.
- [ ] Spot phone numbers and emails in bios (anti-leakage, CLAUDE.md §10).
- [ ] Rate limits live in each server's memory; move them to a shared store
      if abuse shows up.
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
- [ ] Pay-per-click campaigns, after Stage 6: tracked links, click logging
      and filtering (link previews, bots, repeats), click budget escrow,
      batched payouts, click dashboards, destination domain verification.
- [ ] **You:** decide the banned campaign types for the terms (gambling and
      betting are the open question) and the pay-per-click numbers
      (CLAUDE.md §12, open items 10 and 11).
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
- [ ] The landing page's outside figures (`src/components/landing/stats.tsx`)
      were checked on 2026-11-10. Recheck them every few months (TikTok's
      Creator Rewards countries change), and replace them with Pitchype's
      own numbers once there are enough.
- [ ] Next for the landing page argument, from the positioning notes:
      creator performance analytics (reach, clicks, earnings per campaign) so
      "measurable" can be claimed with our own data.
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

- [ ] Stage 8: email off the `notifications` table (Resend), with
      per-person preferences; money-critical ones always send (CLAUDE.md §8).
- [ ] Stage 7: add kinds for submissions and auto-release (a trigger plus a
      case in `src/lib/notifications.ts`). The payment, work started, paid
      cancellation, settlement and payout kinds were added in Stage 6.
- [ ] The bell shows the latest 20. Add a full `/notifications` page if
      people need older ones.
- [ ] Notifications are never deleted. Prune read ones after a few months
      once the table grows.
- [ ] Admins have no bell: they check `/admin`. Notify them of new
      verification requests, reports and first campaigns (Stage 8).

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
      `https://www.pitchype.com/api/webhooks/paystack` with the events
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
- [ ] The `paid_out` engagement status is unused (payouts come from the
      wallet). Decide in Stage 7 whether to drop it from the enum.
- [ ] Cache `listBanks()`; it runs uncached, up to five pages, on every form
      render, name check and save.
- [ ] Rate limits (bank checks, payout requests) are in memory per instance,
      like the others (section 5).
- [ ] Stage 7 must call `settle_engagement_internal` for accept, auto-release
      and disputes, skip the actor in `engagements_money_notify`, and widen
      settlement to `submitted` and `disputed`.

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

## Done

- [x] Database migrations for Stages 1–3 pushed to the live project
      (2026-11-09), with the `profile-photos` bucket.
