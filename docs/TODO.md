# Deferred work

Setup steps, polish and known gaps we've parked so the stages can focus on the
heavy lifting. Tick items off as they're done and add new ones whenever
something is deferred. "You" means it needs a dashboard, DNS or a decision;
everything else is code.

## 1. Before real people can sign up on the live site

The live database is ready; these are what stand between it and a working
sign-up email. Details: README, "Auth email setup".

- [ ] **You:** Resend → add the domain `pitchype.com` and its DNS records; wait
      for "Verified".
- [ ] **You:** pick the sender address. The README says `no-reply@pitchype.com`,
      your env file says `noreply@pitchype.com`. Either works; make the README
      match.
- [ ] **You:** Supabase → Authentication → Emails → SMTP: host
      `smtp.resend.com`, port `465`, user `resend`, password = Resend API key,
      sender name `Pitchype`.
- [ ] **You:** Supabase → Emails → Templates: paste
      `supabase/templates/confirmation.html` ("Confirm your Pitchype account")
      and `recovery.html` ("Reset your Pitchype password").
- [ ] **You:** Supabase → URL configuration: Site URL
      `https://www.pitchype.com`; add every other address the app runs on
      (Vercel previews, `http://localhost:3000` for local production builds)
      to Redirect URLs.
- [ ] **You:** Supabase → Sign in / Providers → Email: "Confirm email" on,
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

- [ ] **You:** privacy notice and terms reviewed by a lawyer. Both still say
      "draft, covers the waitlist only"; they must cover accounts, public
      creator profiles and photos, verification and reports. Then drop the
      draft banner and `noindex`, and add them to the sitemap.
- [ ] **You:** confirm the `hello@pitchype.com` inbox exists. It's in the
      footer and in the message hidden creators see (`src/lib/site.ts`).
- [ ] Link sign-up and login from the site; swap the "Join the waitlist"
      buttons (header, directory, creator pages) for sign-up.
- [ ] Link `/creators` from the site nav, and list it in the sitemap even
      when empty.
- [ ] **You:** create the first admin accounts (sign up, then the SQL in the
      README).
- [ ] **You:** email the waitlist when sign-up opens (export from the
      `waitlist` table).
- [ ] **You:** legal structure for holding escrow funds in Nigeria (CLAUDE.md
      §6 compliance flag). Needed before money goes live (Stage 6).
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
- [ ] Check Paystack's current transfer fees on small payouts before setting
      the minimum payout and minimum cost per click.
- [ ] Spot phone numbers and WhatsApp links in campaign briefs (same check
      as for bios above).

## 7. From building Stage 4

- [ ] Field ids come from field names. Next keeps recently visited pages in
      the DOM (hidden), so the new-campaign and edit forms can briefly sit on
      one page with the same ids. Labels pointed at the right field in
      testing, but switching the form components to React's `useId` would
      rule it out.
- [ ] Signed-in pages have no navigation bar; people move between account,
      profile, campaigns and admin through links on the account page.
- [ ] Tell existing applicants when a live brief changes (Stage 5 creates
      applicants; Stage 8 sends the notification). The history is already
      kept in `campaign_revisions`.
- [ ] From Stage 5, stop places dropping below the number of accepted
      creators (in `campaigns_before_write`).
- [ ] Admins aren't alerted to first campaigns waiting for review or to new
      campaign reports (Stage 8); they check `/admin`.
- [ ] Eligibility is worked out per campaign per creator on every list; add
      caching or a precomputed table if campaigns or creators grow into the
      thousands.
- [ ] The landing page's open-campaign count refreshes hourly.

## Done

- [x] Database migrations for Stages 1–3 pushed to the live project
      (2026-11-09), with the `profile-photos` bucket.
