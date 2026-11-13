# Stage 6: escrow, wallets and payouts: design

Builds on Stage 5 (engagements exist, `awaiting_payment`, lapse after 48 hours).
Money rules stay in CLAUDE.md §6; this document adds the decisions and the
shape. Status: approved 2026-11-13; built on branch stage-6-money.

## 1. Intent

A business can pay for a hire through Paystack. The money is held in escrow on
our own ledger, the creator can start work, and an admin can settle the
engagement (release, refund or split). The creator can then pay out to a bank
account. Everything is test-mode (Paystack test keys) until the legal question
in CLAUDE.md §6 is settled.

**Why:** money safety is the product (§1). Stage 6 builds the whole money path
and its tests before submissions and disputes (Stage 7) add more moving parts.
Stage 7 then only has to *trigger* settlement, not build it.

**Goals**
- Pay a hire: price + 5% fee, wallet balance first, Paystack for the rest.
- Escrow, wallets, fee snapshot, refunds and payouts exactly as CLAUDE.md §6.1–6.3.
- One atomic settlement function, used by the admin tool now and by accept,
  auto-release and disputes in Stage 7.
- A ledger that can be checked against the Paystack balance.

**Non-goals** (do not build)
- Submissions, accept/deny, the 7-day auto-release job, disputes (Stage 7).
- Wallet top-ups, and business wallet withdrawal to a bank (§6.3, §12.9). A
  business that asks is refunded by an admin by hand; note it in `docs/TODO.md`.
- Pay-per-click, per-payment holds, featured placement, email (Stage 8).
- A second payment provider or any abstraction over Paystack.

**Anti-goals:** any path where money moves twice, moves without a ledger row,
or is believed because the browser said so.

## 2. Decisions

| Question | Decision |
|---|---|
| What releases escrow until Stage 7? | Until Stage 7 there are no submissions, so an admin releases or refunds from `/admin` with a written reason. Outcomes: release in full; refund in full (business fee kept); split by amount; refund with fee (creator at fault). In Stage 7 the business's accept, the 7-day auto-release and dispute decisions call the same function. |
| Minimum payout | ₦1,000, on request, no schedule. Stored in `fee_config`. (Closes §12.4.) |
| Payout approval | Every payout needs an admin's approval before any transfer is sent. The admin sees the creator, the bank account, the amount, the transfer fee and the engagement trail, then approves or rejects with a written reason. |
| Business wallet to bank | Not built. Admin refunds by hand on request. |
| Suspended accounts | Payouts carry on (§6.5). No holds in Stage 6. |
| Checkout | Paystack hosted checkout (redirect to `authorization_url`). No Paystack JS, so the public key is unused; only the secret key is needed. |
| Late payment | A payment that succeeds after the approval lapsed is **not** refunded to the card. It lands in the business wallet (below) and the engagement stays cancelled. The business re-hires or asks for a refund. |

## 3. How money moves

**A card payment goes straight to escrow.** When a payment succeeds for an
approved engagement, the money is recorded as escrow for that engagement. The
business wallet is not used. Only two things credit the business wallet: a
stranded payment (one that succeeds after the approval lapsed, or after the
hire was cancelled) and refunds. A business can spend its wallet balance on a
hire, which moves that amount into escrow. If the wallet covers only part of the
total, the wallet pays that part and the card pays the rest, in the same
transaction.

Funding an engagement (`fund_engagement`, one transaction, locks the engagement
and the business's user row):
1. Engagement must be `awaiting_payment` and not lapsed. Otherwise the payment
   is stranded: it credits the business wallet and nothing else.
2. Read the current `fee_config`; snapshot onto the engagement the business fee
   (kobo), the creator fee rate and minimum, and the config id.
3. Ledger: escrow(engagement) +price; platform revenue +fee. The source is
   Paystack for a card payment, or the business wallet for any part paid from
   wallet balance.
4. Status → `funded`. Record that the business saw the non-refundable-fee
   notice (stored when the payment starts; closes the Stage 5 TODO).

Settlement (`settle_engagement(engagement, outcome, release_kobo, reason, actor)`,
one transaction, locks the engagement, no-op if already settled):
- Allowed from `funded`, `in_progress` (and `submitted`/`disputed` from Stage 7).
- `release_kobo` goes to the creator wallet minus the creator fee on that part
  (5%, minimum ₦500, never more than the part itself; nothing if the part is 0).
  The rest of the escrow goes to the business wallet.
- `refund_creator_fault` also returns the business fee minus the Paystack
  charge actually paid on the one payment that funded the hire (the `fees` figure
  from Paystack's verify response on that `payments` row; wallet-only funding
  carries no charge; a stranded late payment is not part of the hire) (§6.2), so the platform breaks even.
- Writes ledger rows, sets status (`accepted` for any release, `refunded` for a
  full refund) and the settled amounts, then raises notifications.

Cancellation before work starts:
- Business cancels a `funded` engagement: price to its wallet, fee kept.
- Creator withdraws from a `funded` engagement: same as `refund_creator_fault`.
- After "Start work" (`funded → in_progress`, creator, behind a confirmation)
  neither side can cancel alone: only an admin settlement (Stage 7 disputes).
- Cancel screens show the non-refundable fee and store that it was seen.

Payouts (every payout is approved by an admin):
1. Creator saves a bank account: Paystack name resolution, create transfer
   recipient, store bank, last four digits, account name and recipient code
   (never the full number).
2. Creator requests a payout and sees the exact amount they will receive before
   confirming. Minimum ₦1,000. One transaction debits the wallet into
   `payout_in_flight` and creates the payout as `requested`. No money has left.
3. An admin reviews it in `/admin/money/payouts` and either approves or rejects
   it, with a written reason.
   - Reject: `requested → rejected`, with a reversing group returning the amount
     to the creator's wallet. The creator sees the reason.
   - Approve: one transaction moves `requested → processing` and records the
     approver, the time and a transfer reference. The server then calls Paystack
     Transfer with that reference. Only a `requested` payout can be approved, so
     a double click changes nothing.
4. Webhook `transfer.success` → `paid`. `transfer.failed` or `transfer.reversed`
   → `failed`, with a reversing group re-crediting the wallet, once Paystack
   confirms the failure (§11, call 4).

## 4. Rules and invariants (these become tests)

1. Integer kobo only; amounts for payment come from the engagement row on the
   server, never from the client.
2. Ledger is append-only (trigger rejects update and delete). Corrections are
   reversing entries. Entries are grouped per movement and each group balances;
   an external "Paystack" account stands for cash in our Paystack balance.
3. A payment is only believed after the server verifies it with Paystack
   (callback page and webhook both do this) and the reference and amount match.
4. Webhook: HMAC SHA-512 of the raw body checked before parsing; each event is
   stored once (unique key) and a repeat is ignored; late or out-of-order events
   are safe.
5. Funding and settlement twice, or concurrently, change nothing the second time.
6. Fee snapshot never changes after funding, even if `fee_config` does.
7. Business fee ≥ Paystack charge on the full payment, for every allowed price
   (₦5,000 up). A test fails if `fee_config` breaks this. Paystack's rate is
   1.5% + ₦100 (the ₦100 waived under ₦2,500), capped at ₦2,000, plus 7.5% VAT.
8. Wallets + escrow + payouts in flight cover exactly what the ledger says we
   hold; the admin Money page shows ledger totals beside the live Paystack
   balance and flags a difference.
9. Money functions are not callable by `anon`/`authenticated` except the few
   that check `current_user_id()` themselves (cancel, start work, request
   payout). The webhook and settlement use the secret-key client.
10. A transfer is only sent for a payout an admin has approved, and each payout is
    approved at most once.

## 5. Data (one migration, plus types regenerated)

- `fee_config`: one row per version (business and creator rate and minimum,
  minimum payout, transfer fee table, and the Paystack rate used only by the
  fee-vs-charge test). The current one is the latest.
- `ledger_entries`: one row per signed amount. Columns: id, `group_id` (one
  business event), `event_type` (`payment_received`, `hire_funded`,
  `hire_settled`, `payout_requested`, `payout_rejected`, `payout_paid`, `payout_failed`,
  `paystack_fee`, `correction`), `account` (`paystack`, `business_wallet`,
  `escrow`, `creator_wallet`, `platform_revenue`, `paystack_fees`,
  `payout_in_flight`), `owner_user_id` (null for platform accounts),
  `engagement_id`, `payment_id`, `payout_id`, `paystack_reference` (nullable),
  `amount_kobo` (signed bigint), `actor_user_id` (null for `system`), `reason`
  (required for admin actions), `fee_config_id`, `created_at`. Each `group_id`
  sums to zero. Append-only: a trigger rejects update and delete, and no role
  is granted either. RLS: a person reads only their own wallet rows and their
  own engagements.
- `engagements` gains: fee snapshot columns, `funded_at`, `started_at`,
  settled amounts and outcome, `settled_at`; new cancel reasons (`cancelled_by_creator`
  and the fault outcome); the cancel check is widened accordingly.
- `payments`: engagement, Paystack reference (unique), amount, the frozen
  total (price + fee) and `fee_config` id, status
  (`initiated`, `succeeded`, `failed`), Paystack fee actually charged,
  `fee_notice_seen_at`.
- `payment_events`: processed Paystack event keys (unique), for idempotency.
- `bank_accounts`: creator, bank, last four digits, account name, recipient code.
- `payouts`: creator, amount, transfer fee, status (`requested`, `processing`, `paid`, `failed`, `rejected`), transfer reference (unique), `approved_by`, `approved_at`, `decision_reason`, `paid_at`.
- Functions: `fund_engagement`, `settle_engagement`, `record_payment`,
  `request_payout`, `finish_payout`, `start_engagement`, `cancel_funded_engagement`.
  Server-called ones are granted to `service_role` only.
- Notification kinds (trigger plus a case in `describeNotification`): funded,
  work started, cancelled, settled, payout paid, payout failed.

## 6. Screens

| Route | Who | What |
|---|---|---|
| `/business/engagements/[id]/pay` | Business | Real pay button; shows wallet use, remainder and the fee notice |
| `/business/engagements/[id]/pay/return` | Business | Paystack callback: verifies server-side, then shows the result |
| `/business/wallet` | Business | Balance and ledger history |
| engagement page (business and creator) | Both | Status, Start work (creator, with confirmation), cancel or withdraw with the fee notice |
| `/wallet` for creators | Creator | Balance, history, bank account, payout request with the exact amount received |
| `/admin/money` | Admin | Payouts awaiting approval, each with the creator, bank account (masked), amount, fee and engagement trail; Approve and Reject (reason required); engagements in escrow with settle actions (reason required); ledger vs Paystack check |
| `/api/webhooks/paystack` | Paystack | `charge.success`, `transfer.success`, `transfer.failed`, `transfer.reversed` |

All new pages get skeleton loading states and are checked at 390px. Sidebar gains
Wallet for both roles.

## 7. Approaches considered

1. **Admin settlement tool now (chosen).** Builds the full settlement function
   and money path now; Stage 7 only adds triggers. Cost: an admin screen that
   Stage 7 partly reuses for disputes.
2. **Pull a minimal accept/deny into Stage 6.** Rejected: half of Stage 7, built
   twice.
3. **Leave release out.** Rejected: wallets and payouts could not be tested.

## 8. Testing

- Unit: fee and settlement maths, rounding, the business-fee-vs-Paystack-charge
  sweep over all prices, signature check, payout amount shown.
- Database (pgTAP): ledger append-only and balanced, funding twice, settling
  twice, funding after lapse, wallet never negative, RLS and grants.
- Concurrency script against local Supabase: two funds, fund + lapse, settle +
  settle, request two payouts with one balance.
- Payouts: no transfer without approval; approve twice, reject after approve, and approve after reject all change nothing the second time.
- Webhook: locally signed
- Browser run with Paystack test cards: pay, start, settle, payout.
- Real Paystack webhooks need a public URL, so they are exercised after deploy;
  locally the callback verification and signed payloads cover the same code.

## 9. Left to the builder

Exact table and column names, how the ledger groups are keyed, the transfer fee
table (check Paystack's current rates; `docs/TODO.md` already flags it), page
layouts within the design system, and the order of the work.

## 10. Docs to update in the same change

CLAUDE.md (§6 additions, §12 decisions: minimum payout, late payment, settlement
outcomes), `docs/PROVIDERS.md` (Paystack boundary `src/lib/paystack.ts`, the
webhook, the Transfer API), `.env.example` (`PAYSTACK_SECRET_KEY`), `README.md`,
`docs/TODO.md`.

Secrets: the test keys go only in `.env.local` (git-ignored), never in the repo.

## 11. Calls made after the builder check (my calls, for you to check)

1. **Paystack's own charges.** A card payment is recorded at the gross amount
   the business paid (escrow and platform revenue). The actual Paystack charge,
   from the verified transaction, goes to a platform `paystack_fees` account at
   payment time. Reconciliation: Paystack cash = escrow + wallets + payouts in
   flight + platform revenue − `paystack_fees`. A refund of a stranded payment to
   a card is net of the Paystack charge, since Paystack does not return it.
2. **A payment in flight.** `payments` freezes the total, the fee and the
   `fee_config` id when payment starts, and `fund_engagement` uses those, so a
   config change in between cannot leave the wallet short. The lapse job skips an
   engagement that has an `initiated` payment started in the last 30 minutes, and
   `cancel_engagement` is refused for the same window. `fund_engagement` still
   checks the status itself, as the daily job may run late.
3. **Wallet spent between starting and finishing a payment.** No reservation.
   If the wallet no longer covers the total when the payment succeeds, funding
   leaves the money in the wallet and the pay page says so and offers a retry
   with the new remainder.
4. **Payout safety.** Every payout waits for an admin's approval. The payout's
   transfer reference is fixed at approval and sent to Paystack, so a retry cannot
   send twice. A payout moves only `requested → processing → paid` or `failed`, or
   `requested → rejected`; `paid`, `failed` and `rejected` are final. Before
   re-crediting the wallet for `transfer.failed` or `transfer.reversed`, the server
   fetches the transfer from Paystack, so a late `transfer.success` cannot double
   pay. The daily job polls payouts stuck in `processing` for over 15 minutes and
   asks Paystack for their status. It does not touch `requested`, which waits for
   a person. Tests: a crash after approval, and `failed` arriving before `success`.
5. **Transfer fee.** Taken from the table in `fee_config` and shown before
   confirming. Any difference from what Paystack really charges is absorbed by
   the platform and booked to `paystack_fees`, so reconciliation shows it. Live
   transfers need OTP confirmation turned off in the Paystack dashboard: added
   to `docs/TODO.md` as a "You" item.
6. **Settled status.** Any release sets `accepted`; a full refund sets `refunded`.
   `paid_out` is not used in Stage 6, because payouts come from the wallet, not
   from one engagement. Stage 7's accept calls the same `settle_engagement`.
7. **Suspended or blocked businesses can still pay for a hire already approved.**
   The work is already agreed; this matches §6.5 and the Stage 5 rule that acting
   on existing engagements stays open.
8. **The business wallet is not a top-up.** A card payment for a hire goes
   straight to escrow and never shows as a balance. The wallet holds only
   refunds and stranded payments, and the business cannot add money itself. This
   reads CLAUDE.md §6.3 as "no way for a business to top up", and needs your
   confirmation.

## 12. Audit trail: every naira traceable

**Rules**
- No money moves without a ledger group. A group is one business event; its
  rows sum to zero.
- Each group records who (`actor_user_id`, or `system` for scheduled jobs), why
  (a written reason for every admin action), which Paystack reference it came
  from, which `fee_config` it used, and when (UTC).
- Corrections are new reversing groups with a reason. Nothing is edited or deleted.
- Raw Paystack responses for payments and transfers are kept in `payment_events`
  with secrets removed and account numbers masked, so every figure can be checked
  against Paystack's own record.
- A daily job writes a `reconciliation_runs` row: Paystack's balance, the
  ledger's expected cash, and the difference. A non-zero difference raises an
  admin alert (in-app in Stage 6, email in Stage 8).

**Admin views** (all read-only except the existing settle action)
- `/admin/money/engagements/[id]`: one timeline per hire: the payment, the fee
  split, funding, work started, settlement and every payout, each with amount,
  actor, reason and Paystack reference. It must add up to the agreed price plus fees.
- `/admin/money/ledger`: every group, filterable by person, engagement, event
  type and date, exportable to CSV.
- `/admin/money/payouts`: every payout with its approver, the reason, its transfer status and a live check against Paystack.
  against Paystack.
- `/admin/money`: reconciliation runs and the difference over time.

Businesses and creators see the same trail for their own money, without the
internal accounts.

**Worked example: a ₦50,000 hire** (the Paystack charge is an estimate here; the
real figure comes from the verify response)

| Step | What happens | Where the money sits |
|---|---|---|
| 1. Business pays ₦52,500 by card | Paystack charge ≈ ₦954 booked to `paystack_fees`. Escrow ₦50,000; business fee ₦2,500 to platform revenue | Paystack cash ₦51,546 net; owed to the hire ₦50,000; revenue ₦2,500 |
| 2. Work accepted | Escrow ₦50,000 → creator wallet ₦47,500; creator fee ₦2,500 to platform revenue | Creator sees ₦47,500; still in Paystack |
| 3. Creator requests ₦47,500; admin approves | On request, wallet → payout in flight. On approval, the ₦75 transfer cost (₦25 tier fee + ₦50 stamp duty) is taken from the creator's payout and the transfer is sent | Paystack sends ₦47,425 to the bank; Paystack's ₦75 cost is recovered from the creator, so the platform's net cost is zero |
| 4a. Transfer succeeds | Payout `paid`. Cash has left Paystack | Nothing left in the trail to move |
| 4b. Transfer fails | Reversing group re-credits the creator wallet ₦47,500 | Creator wallet ₦47,500 again |

Platform revenue for this hire: ₦5,000 gross, less the ₦954 Paystack charge = ₦4,046 net, matching §6.4.

**Tests added**
- Every group sums to zero.
- For each engagement: business paid = escrow + business fee; escrow released =
  creator fee + creator wallet credit; each payout closes its wallet debit.
- After each integration flow, a reconciliation run shows zero difference.
- Updating or deleting a ledger row fails.

## 13. Built differently from this design (and why)

Recorded while building, from the build ledger. Sections 1 to 12 above are the
approved design; where they disagree with the code, the code and the entries
below win. How it works now: CLAUDE.md §6.6.

**Money maths and fees**
- Ruling: the transfer cost is Paystack's tier fee **plus a flat ₦50 stamp
  duty from ₦10,000**, paid by the creator (CLAUDE.md §6 rule 8 says the creator
  pays at cost; the plan had the tier fee only). The §12 example is corrected to ₦75 (₦25 plus ₦50).
- Ruling: the fault refund subtracts **only the Paystack charge of the payment
  that funded the hire**, found through the escrow ledger line's payment, not
  every succeeded payment. A stranded late payment's charge was already absorbed
  (§11 call 1). §3 was edited to say so.
- Ruling: Paystack's rate figure and the minimum payout in `fee_config` are asserted equal to
  `src/lib/fees.ts`, as the transfer tiers are (the open-ended last tier is `null` in SQL and `Infinity` in TypeScript).
- Ruling: SQL fee maths use integer arithmetic that rounds half up exactly like
  `Math.round` in TypeScript, with half-kobo tests on both sides.

**Where money goes**
- Ruling: a card payment goes **straight to escrow** and never shows as a wallet
  balance. A payment that cannot fund its hire is **stranded** into the business wallet
  as a `payment_received` group. Cancellations and refunds use the event type `hire_settled`
  (no new event type was needed). The user confirmed no direct top-ups on 2026-11-13.
- Ruling: a hire whose wallet covers the whole total is paid with `pay_from_wallet()`;
  `start_payment()` refuses it with `wallet_covers_total`.
- Ruling: `fund_engagement()` and `settle_money()` are internal (granted to no
  role). `settle_engagement()` is the admin-only wrapper over
  `settle_engagement_internal()`, which Stage 7 calls for accept, auto-release
  and disputes. `record_payment` became `record_card_payment`, and `start_payment`,
  `pay_from_wallet`, `approve_payout`, `reject_payout`, `save_bank_account_for`,
  `admin_engagement_trail`, `admin_ledger` and `record_reconciliation` were added.
- Ruling: `settle_engagement` checks the release amount before the no-op for an
  already settled hire (`release_invalid`) and requires a reason of 1 to 500 characters. Because a
  repeat settle is a silent no-op, the admin screen compares the hire's stored
  outcome with the request and says "already settled" instead of "Settled" when
  they differ (`src/lib/settle-guard.ts`). Two admins settling the same way at once
  both see "Settled", and only the first reason is kept.
- Ruling: `paid_out` is not used; any release sets `accepted` (§11 call 6, as designed), and the
  Stage 5 enum value stays.
- Ruling: the ledger migration's integrity hardening (triggers that fire even in replica mode,
  `post_ledger_group` refusing non-number amounts) went into the funding migration, because an applied
  migration is never edited.

**Payouts**
- Ruling: the payout **destination (bank, last four digits, name, recipient code) is
  snapshotted at request time**, together with the transfer cost, and approval returns those copies, so changing the bank
  account later cannot redirect a payout already requested.
- Ruling: `save_bank_account_for(person, ...)` is **server-only** (service role).
  Signed-in people can no longer call `save_bank_account`, which would let a creator skip Paystack's name
  resolution. The server saves an account in two steps: check the name, then save after
  resolving it again.
- Ruling: `finish_payout` removes the full account number from stored transfer payloads
  (`data.recipient.details.account_number`), and only from payloads shaped like Paystack's,
  because a malformed payload must not make the webhook fail forever (migration `20261113100550`).
- Ruling: card payment payloads are **trimmed** by the server before storing
  (reference, amounts, fees, currency, status, channel, paid time, ids), not scrubbed in SQL.
- Ruling: `reject_payout` records the reason but no approver or time; `approve_payout` does.
- Ruling: payout requests and bank checks are rate limited (5 payouts per 10 minutes, 10 checks
  and saves per hour, per user, in memory per instance: `src/lib/money-limits.ts`), as CLAUDE.md §7 asks.

**Webhook and Paystack**
- Ruling: the decisions live in `handlePaystackWebhook` (`src/lib/payments.ts`) so they can be unit tested; the route is a
  thin adapter. It accepts only references that are exactly `pit_` or `pit_po_` plus 32 hex characters.
- Ruling: **retry semantics for Paystack errors.** Only 400 and 404 are acknowledged with 200; 429, 401, 403,
  other 4xx and any 5xx return 500 so Paystack retries, because nothing else polls card payments and an
  acknowledged miss would never be recorded. A charge still pending returns 503.
- Ruling: **transfer event keys come from Paystack's verified status**
  (`transfer.success:<ref>`, `transfer.failed:<ref>`, `transfer.reversed:<ref>`, `transfer.not_found:<ref>`), not from the webhook's event name,
  so the stored key matches what Paystack reported when we asked. Card keys are `charge.success:<ref>`.
- Ruling: a transfer Paystack cannot find (`not_found`) is treated as failed only after the
  payout has been `processing` for over 15 minutes (`stuckPayoutCutoff`), and `verifyTransfer`
  maps a "not found" message to `not_found` only for statuses below 500, so an outage never reads as "never sent".
- Ruling: `verifyTransaction` throws if a success has no fees; amounts and fees must be whole numbers;
  `src/lib/paystack.ts` validates input before any network call and its errors never carry the key or a full account number.
- Ruling: non-NGN payments are refused before `record_card_payment`, which has no currency argument.
- Ruling: a card payment that raises a money-state error (wrong total, not succeeded, invalid fee) is logged and left for an admin
  (`needs_review`) with a 200, rather than retried forever; there is no durable alert yet.

**Checks, alerts and screens**
- Ruling: the money-checks job answers **500 when any step failed** (a failed stuck-payout lookup, a failed
  reconciliation or any errored payout), with the same body, so the scheduler's log shows it. If Paystack's balance cannot
  be read, no reconciliation row is written.
- Ruling: **unbalanced-ledger detection goes through `note`**: `reconciliation_figures()` computes expected cash
  from the other accounts and says in `note` when the accounts do not sum to zero or the balance differs, so a run checks the ledger as well as the bank.
- Ruling: the "non-zero difference" alert is a callout on `/admin/money` from the latest run, not a notification; a durable
  alert is Stage 8 (§12 said "in-app in Stage 6").
- Ruling: creators' job page is `/jobs/[id]` and the wallets are `/wallet` and `/business/wallet`; the proxy treats `/jobs`, `/wallet` and the nested admin routes as signed-in.
- Ruling: the wallet ledger labels an outgoing `payment_received` on a business wallet "Paid for a hire", and any
  event and account pair whose sign contradicts its label falls back to "Wallet activity".
- Ruling: nine Stage 6 migrations: ledger, funding, settlement, the fault-refund fix, payouts, notifications,
  audit, the payload-scrub guard and, after the final review, the stranded-payment notice and grant hardening
  (`20261113100600`) (the design expected one migration plus types).

**Testing**
- Ruling: the concurrency script uses separate `psql` sessions through `docker exec` (no new dependency), with
  statement and lock timeouts. It leaves permanent rows (emails ending `@race.pitchype.test`) in the local ledger, which is append-only.
- Not done: the signed-in browser run with Paystack test cards (§8). The Chrome extension was not connected,
  so no one clicked through the Stage 6 screens signed in; only signed-out routes, a signed webhook
  and the database and unit tests were exercised. Real webhooks need a public URL.

**Built after the final review** (`20261113100600` and the app, 2026-11-13)
- The **live Paystack check** for payouts (§12): `/admin/money/payouts` has **Check with Paystack** on each
  payout still `processing`. It runs the same idempotent `confirmTransfer()` as the webhook and the daily job,
  and says what happened in fixed words (`payoutCheckOutcome` in `src/lib/payout-request.ts`); Paystack's text is never shown.
- The **reconciliation history** (§12): `/admin/money` lists the last 30 runs (time, Paystack balance, expected cash,
  difference) under the latest-run callout.
- The **stranded-payment notification**: an AFTER INSERT trigger on `ledger_entries` tells the business
  (`payment_stranded`) when a `payment_received` row credits its wallet (a negative `business_wallet` amount, which only
  a stranded payment writes). The reviewed money functions were not edited.
- Hardening: the service role lost execute on `post_ledger_group()` (only money functions post, as owner) and on the
  unused `save_bank_account()`.

**Not built, and RELEASE BLOCKERS before real money**
- No correction/adjustment tool: the `correction` event type exists but no function or screen can post a reversing
  group (needed to book a mismatched payment, a reversal after `paid`, or a hand refund of a business wallet).
- A transfer-fee difference (our fee table vs Paystack's real charge) is not booked to `paystack_fees`; it appears as a
  reconciliation difference.
- Both need their own design and review (money-critical SQL); see `docs/TODO.md`, "Before real money".
