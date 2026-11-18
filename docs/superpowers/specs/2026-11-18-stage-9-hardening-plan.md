# Stage 9: hardening and launch (plan)

Written 2026-11-18, after Stage 8 (email) merged to `main`. The roadmap in
`docs/BUILD_PROMPT.md` lists this stage as: security review, load and
reconciliation checks, legal review, monitoring, and the switch to Vercel Pro
and Supabase Pro. Stage 9 adds no product features. Its goal is that opening
sign-up to the public is safe to do.

Written for: the engineer who builds Stage 9, and the user who owns the
non-code items.

## Already in place (checked 2026-11-18)

- Lint, typecheck and 456 unit tests pass; `next build` passes locally.
- 25 pgTAP suites cover RLS, the ledger, settlement, payouts, submissions,
  disputes, auto-release, email queue and audit.
- `scripts/money-race.mjs` races the money functions from separate sessions.
- CI (added in this stage, `.github/workflows/ci.yml`): lint, typecheck, unit
  tests, build, and pgTAP against a fresh local Supabase.

## Gaps this plan closes

| Gap | Where it comes from | Plan |
|---|---|---|
| Rate limits live in each server's memory | `src/lib/rate-limit.ts`, TODO §5 and §12 | Done: counted in Postgres (`consume_rate_limit`, migration `20261118100200`) |
| No security headers | `next.config.ts` has none | Add a CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS on Vercel |
| No dependency audit | nothing runs `npm audit` | `npm audit --omit=dev` in CI, failing on high and critical only |
| No error monitoring | nothing reports server errors | Done: PostHog, errors only (`src/lib/observability.ts`) |
| Race tests not run anywhere | `money-race.mjs` is run by hand | Run it in CI after `supabase start` (scenarios 1–21) |
| Reconciliation never checked live | `/api/cron/money-checks` runs daily | Check one live run against Paystack's balance before launch |
| Query plans unchecked | CLAUDE.md §11 asks for `explain analyze` | Check the campaign browse, directory and inbox queries on a seeded database |
| Formatting drift | `npm run format:check` fails on 16 files | Format them in one commit, then add `format:check` to CI |
| Hosted Supabase may be behind | Stage 4–5 migrations were not pushed (memory note); Stages 6–8 not confirmed | Compare `supabase migration list` with the hosted project before launch |

## Plan, in order

1. **CI** (this change). Get it green on GitHub, then make it required on `main`.
2. **Formatting pass.** One commit, no logic changes, then `format:check` in CI.
3. **Security review.** Walk every route handler and server action against
   CLAUDE.md §7 (authenticate, authorize, validate, act). Confirm the service
   key is only in `src/lib/supabase/admin.ts`. Check each RLS policy with a
   user JWT, not the service role. Add the security headers. Add `npm audit`.
4. **Rate limits.** Move the money and auth limits to a shared store, or accept
   the in-memory limit for launch and write down the risk. This needs a
   decision first.
5. **Money checks.** Run `money-race.mjs` against a seeded local database and
   add it to CI. Read the reconciliation output and confirm the arithmetic
   matches the ledger. Replace the log-only handling of `needs_review` and
   amount-mismatch payments (TODO §12, line 365) with an admin-visible item, or record
   that the risk is accepted.
6. **Load and query checks.** Seed roughly 1,000 creators, 500 campaigns and
   5,000 notifications. Run `explain analyze` on the browse, directory and
   inbox queries. Add indexes only where a plan needs one.
7. **Monitoring.** Error reporting plus an alert when a cron job fails or a
   payout sits in `processing` for over a day.
8. **Launch configuration.** Update `docs/PROVIDERS.md`, `.env.example` and the
   Vercel project. Confirm the Frankfurt region, `CRON_SECRET`, the Paystack
   live keys, and the Resend domain.
9. **Pre-launch items from TODO §3** that need the user (below).

## Left to the user (not code)

- Legal review of `docs/legal/` by a Nigerian fintech and data lawyer. The
  notice and terms still say "draft, covers the waitlist only". This gates
  going live.
- The legal structure for holding escrow funds (CLAUDE.md §6 compliance flag).
  Money runs in test mode until this is settled.
- Vercel Pro and Supabase Pro (backups, point-in-time recovery, no cold pauses).
- Create the first admin accounts; confirm `hello@pitchype.com` exists; email
  the waitlist.
- Live Paystack rates against `src/lib/fees.ts` and `fee_config` (TODO §12).

## Open decisions (ask before building)

1. ~~Error monitoring provider~~ Decided: PostHog, errors only, no SDK.
2. ~~Shared rate-limit store~~ Decided: Postgres counter (see the gaps table).
3. Whether Playwright joins the repo for end-to-end tests (TODO §4). It is a
   new dev dependency.

## Done means

`main` is protected by a green CI run. The race tests and pgTAP run on every
PR. A live reconciliation run matches the ledger. Security headers are on.
Each user-owned item above is ticked in `docs/TODO.md` by the user.
