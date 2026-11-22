# Cray Finance as the default payment provider (design)

Date: 2026-11-21. Status: approved in conversation with the owner; builder check pending.

Sources for every Cray fact below: Cray's v2 docs (https://docs.crayfi.com/v2, full text at
https://docs.crayfi.com/llms-full.txt) and written answers from Cray's support agent on 2026-11-21
(quoted in §12). Anything marked **verify in sandbox** is a fact the docs leave open or contradict.

---

## 1. Why

An end-to-end production test showed Paystack is a poor fit: by default it pays every collection out
to the bank, so money does not stay where our ledger says escrow is. Cray keeps collected money in a
merchant wallet until we send it out, which is what escrow-as-a-ledger-concept (CLAUDE.md §6 rule 3)
needs.

**Outcome wanted by the owner:**

1. Cray handles business payments and creator payouts by default.
2. The Paystack implementation stays, working, and an admin can switch new payments and payouts back
   to it.
3. Businesses can pay by **card** or by **bank transfer**.
4. A bank transfer of the wrong amount is handled automatically and the business is told the
   difference (see §5.3).

## 2. Goals, non-goals, anti-goals

**Goals**
- Card payments through Cray's hosted checkout.
- Bank transfer through a **permanent Cray virtual account per business** ("your Pitchype transfer
  account"). Any amount is accepted; it lands in the business wallet in our ledger; a hire waiting on
  a transfer is funded automatically once the wallet covers it; shortfalls and extras are notified.
- Creator payouts through Cray's NGN disbursement.
- One admin switch (default Cray) choosing the provider for **new** card payments, new transfer
  payments and new payouts.
- Per-provider cash and fee accounts in the ledger and per-provider reconciliation.
- Every money rule in CLAUDE.md §6 still holds, on both providers.

**Non-goals (not in this change)**
- Business wallet withdrawal to a bank or card (open decision 9 stays open; an admin refunds by hand).
- Mobile money, USDT, cross-currency, Cray refunds API, Cray card-on-file (`/initiate` with raw card
  data: we never touch card numbers).
- Migrating old Paystack rows or money to Cray.
- Renaming existing Paystack-named columns/accounts (see §9, "names").
- Going live: everything stays in test/sandbox mode until compliance (CLAUDE.md §6.4 flag) is settled.

**Anti-goals (a failure even if it works)**
- A generic "payment processor" interface/plugin layer. Two boundary files and plain `switch`es.
- Any path where a webhook body alone decides money **unless it is signed** (only Cray's
  `collection.*` events are signed; `payin` and `payout` are not).
- Any path that could send a payout twice, or re-credit a wallet for a payout that may have gone out.
- Storing or logging a full bank account number in clear text.
- A toggle flip that strands or re-routes something already started.

## 3. Constraints

- CLAUDE.md §2 and §2a still apply. This change **amends** three rules, with the owner's approval
  (2026-11-21) — the builder updates CLAUDE.md in the same change:
  - §2 "One payment provider (Paystack)" → two providers, Cray default, Paystack kept; still no
    abstraction layer beyond the boundary files and one small routing module (§4.1).
  - §6.3 "Do not build wallet top-ups yet" → a business's transfer account can receive any amount at
    any time; it lands in the business wallet. Withdrawal is still not built.
  - §6.6 / §7 "never the full number" → the full bank account number is stored **encrypted**
    (§6.2); only the last four digits are ever shown or logged.
  - §6.1 / §6.4 on Cray: **every processor charge is carried by the business or the creator, never
    by Pitchype** (owner, 2026-11-21). Card: Cray adds its charge on top at checkout. Transfer: the
    business sends the amount plus a ₦200 allowance, and the wallet is credited what arrives minus
    Cray's charge. Payouts: the creator pays the transfer cost (as today). Pitchype keeps its full
    5% from each side. The Paystack path keeps today's economics unchanged (our fee covers its
    charge), so its invariant test stays.
- Integer kobo everywhere inside the app. Cray speaks **naira with decimals** (strings like
  `"3950.00000000"` and numbers like `0.95`); convert exactly at the boundary (§4.2).
- Every Cray API call needs `Authorization: Bearer <key>` **and** an ES256 `X-Signature`
  (docs: "required by default"). Each API key carries exactly one scope (`collection`,
  `disbursement`, `conversion`, `webhook`), so we hold several keys.
- No new npm dependencies: `node:crypto` covers ES256 signing, HMAC-SHA256 and AES-256-GCM.
- Must run on plain Node (§2a). Cray IP whitelisting stays **off** (Vercel IPs are not static); note
  it in PROVIDERS.md.
- Lagos time / UTC rules, RLS on every new table, migrations only, `supabase db reset` must pass.

## 4. Approaches considered

| | Approach | Trade-off | Decision |
|---|---|---|---|
| A | Hosted checkout for card **and** transfer (one-time accounts) | Smallest. But Cray confirmed a one-time account only accepts the exact amount: a wrong amount never reaches us, stays "pending" at Cray and needs Cray support. The owner's "notify the difference" is impossible. | Rejected |
| **B** | **Card via hosted checkout + a permanent virtual account per business for transfers** | Delivers automatic wrong-amount handling. Costs: reverses §6.3 (top-ups), adds a deposit path and a table. Cray confirmed the deposit webhook is signed and carries both the receiving account and our account reference. | **Chosen by the owner** |
| C | A now, B later | Was the fallback while attribution was unconfirmed; Cray's answers removed the reason. | Dropped |

For the switch: **one switch for collections and payouts** (my call; the owner did not object), with
every started payment and payout pinned to the provider it started on. Two independent switches were
considered and dropped: they double the states to test and invite collecting on one provider and
paying out from another without a cash move.

### 4.1 Code shape

- `src/lib/cray.ts` — new boundary file, the **only** code that calls Cray. Same style as
  `src/lib/paystack.ts`: plain `fetch`, 15 s timeout, no retries, `CrayError` with HTTP status
  (0 = no answer), errors never carry keys or full account numbers.
- `src/lib/paystack.ts` — unchanged.
- `src/lib/payments.ts` — keeps the decisions. `confirmCardPayment`, `confirmTransfer` and the
  webhook handlers branch on the payment's / payout's stored `provider` (a `switch`), and gain
  `handleCrayWebhook` and `recordDeposit` decisions. Same `deps` injection style for tests.
- Small routing in the callers that start things (pay action, bank form, payout approval, money
  checks): read the active provider once, `switch` on it. If the same switch appears in three or more
  places, the builder may gather them into `src/lib/processor.ts` (plain functions) — not before.
- `src/app/api/webhooks/cray/route.ts` — thin adapter, like the Paystack one.

### 4.2 Naira ↔ kobo (in `cray.ts`, unit-tested)

- `koboToNaira(kobo) → string`: `"52500.00"` (always two decimals, string, never a float).
- `nairaToKobo(value: string | number) → number`: parse the decimal text (`String(value)` for
  numbers), allow trailing zeros beyond two decimals (`"3950.00000000"`), **throw** if any non-zero
  digit sits past the second decimal, if negative, or if it isn't a safe integer of kobo. Never
  multiply a float by 100.

## 5. What gets built

### 5.1 The provider switch

- New table `payment_provider_settings` (append-only: `id`, `provider` check in
  `('cray','paystack')`, `changed_by`, `reason` 3–500 chars, `created_at`). The current provider is
  the latest row. Seeded with one row `cray`, reason "Default since 2026-11-21", `changed_by` null.
- `active_payment_provider()` (stable SQL function) returns the latest row's provider.
- `set_payment_provider(provider, reason)` — admin only (checked inside), writes a row and a
  `moderation_events`-style audit is **not** needed: the table itself is the audit trail.
- Server refuses to switch **to** a provider whose required env vars are missing (check in the admin
  action, message names which variable group is missing, never the values).
- Admin page `/admin/money/provider`: current provider, history, switch form with required reason,
  plus a plain-language note of what the switch does and doesn't do. Linked from `/admin/money`.
  Skeleton loading state.
- **What the switch governs:** which provider `start_payment` stamps on a new card payment, whether
  the pay page offers bank transfer (Cray only), which bank details a payout request snapshots and
  which provider sends it.
- **What it never governs:** anything already started. Webhooks, the return page, pollers and the
  money checks always act on the provider stored on the row. Deposits into existing Cray transfer
  accounts are always credited, whatever the switch says.

### 5.2 Card payments on Cray

- `payments` gains `provider text not null default 'paystack'` (check in both values) and
  `method text not null default 'card'` (check `('card','transfer','wallet')` — builder may skip
  `'wallet'` if wallet-only payments never create a row; check the code). Existing rows backfill to
  `paystack`/`card`. The default for **new** rows comes from `active_payment_provider()` inside
  `start_payment`, not from the column default.
- Pay action: when the payment's provider is `cray`, call `cray.initializeCheckout({ amountKobo:
  cardAmountKobo, reference, email, name, callbackUrl })` → `POST /checkout/initialize` with
  `currency: "NGN"`, `defaultPaymentMethod: "card"`, `paymentMethods: ["card"]`,
  `feeBearer: "customer"` (Cray adds its card charge to what the business pays; §3),
  `token: CRAY_SUBACCOUNT_TOKEN`, `customer: {name, email}`,
  `callback_url: <site>/business/engagements/<id>/pay/return?reference=<ref>` (we put the reference
  in the URL ourselves; don't rely on Cray appending one). Redirect to `data.link`.
- Verify: `GET /checkout/query/{reference}` (Bearer collection key + signature; Cray's agent wrote
  `/api/checkout/query/…` — **verify the path in sandbox**). Map `data.status`:
  `Successful` → success, `Failed` → failed, `Abandoned` → abandoned, anything else (incl.
  `Pending`) → pending. Both via `nairaToKobo`. With `feeBearer: "customer"` the figure compared
  with the payment's frozen card part is **what we receive** (expected to be `net_amount` = our total,
  with `amount` = total + Cray's charge) — **verify in sandbox** which field is which. The
  processor charge recorded on the payment (`paystack_fee_kobo`, §9) is the part *we* bore: 0 when
  the business carried it. A creator-fault refund then returns price + business fee in full, which
  is break-even for us. Check `data.reference` equals ours. If a `currency` field is present and isn't
  `NGN` → mismatch; if absent, accept (we initialise NGN only) — **verify in sandbox**.
- Then the existing `record_card_payment()` path, which must now post cash to the payment's
  provider cash account and the charge to that provider's fee account (§5.6).
- Return page: provider-neutral wording ("our payment provider"), reads `reference` from the query
  (Cray) or `reference`/`trxref` (Paystack), confirms through `confirmCardPayment` as today.
- Webhook: `payin` (unsigned) and any `collection.*` event whose `data.reference` or
  `data.merchant_reference` matches `^pit_[0-9a-f]{32}$` are a **hint only** → `confirmCardPayment`.
  Same 200/5xx rules as Paystack (§6.6 "Retries"), mapped to `CrayError` statuses.
- **Poller (new):** because `payin` is unsigned and may be missed, the daily money check also
  confirms Cray card payments still `initiated` that are older than 10 minutes and younger than
  7 days (cap the batch, e.g. 200). Card payments on Paystack keep relying on webhook + return page.

### 5.3 Bank transfer via a permanent account per business (approach B)

**The account.** New table `deposit_accounts`: `id`, `user_id` (business, unique per provider),
`provider` (`cray`), `reference` (ours, `pit_va_<32 hex>`, unique), `provider_account_id`,
`account_number` (10 digits; it is *our* receiving account, not personal data, so stored in clear),
`bank_name`, `account_name` (as returned by Cray — Cray may prefix it, so always show the returned
name), `created_at`. RLS: the business reads its own row; admins read all; writes only through a
service-role function. Created lazily the first time a business chooses "Pay by bank transfer"
(`POST /virtual-accounts/create`, Bloc permanent: `type: "individual"`,
`virtual_account_type: "Permanent"`, `currency: "NGN"`, `provider: "Bloc"`,
`account_name: "Pitchype – <business name>"`, `customer_email`, `reference`). On timeout, retry with
the **same** reference (Cray: "reuse it only to retry the same request").

**BVN — open.** Cray's REST docs list no BVN for a Bloc permanent account, but its SDK docs say NGN
permanent accounts need an 11-digit `bvn`; Cray hasn't answered yet. Build account creation without
a BVN and try it in the sandbox first. **If Cray refuses it, stop and ask the owner** before building
any BVN/NIN capture: the separate KYC/KYB project (Dojah: NIN for creators and unregistered
businesses, CAC for registered ones) is where identity data will be collected, and PalmPay
permanent accounts accept a NIN instead of a BVN.

**Starting a transfer payment.** Pay page offers two buttons when the active provider is Cray:
"Pay by card" and "Pay by bank transfer". Both need the non-refundable-fee notice ticked (stored, as
today). Transfer calls `start_payment` with `method = 'transfer'` (frozen total, fee, wallet part,
transfer part, reference, fee notice time — exactly like a card payment). The page then shows the
transfer account (bank, number with a copy button, returned account name) and the amount to send:
`total − wallet balance` **plus the transfer allowance** (₦200, Cray's stated cap on its NGN
transfer charge, stored in `fee_config` as the Cray `transfer_in` allowance), with plain copy:
"Send ₦12,700: ₦12,500 for this hire plus up to ₦200 for the bank-transfer charge. Anything the
charge doesn't use stays in your Pitchype wallet. If you send a different amount it also goes into
your wallet and we'll tell you what's left to pay." The 30-minute hold
on the lapse/cancel applies to transfer payments exactly as to card payments (my call: bank
transfers in Nigeria are near-instant; extending the hold isn't needed). The page refreshes the
status (Realtime notification, no polling loop needed).

**A deposit arrives** (`collection.virtualaccount.successful`, signed — §5.5). Cray has no API to
look a deposit up, so the **signed webhook is the evidence** (documented exception to "verify with
the provider"; the signature is what makes it safe). The webhook data carries `recipient` (account
number), `customer_reference` (our `pit_va_` reference), `transaction_reference` (Cray's deposit id),
the amount and `charge`. Field names other than those three are **verify in sandbox**; take amount
from `amount` and charge from `charge` as in Cray's other collection events.

`record_deposit(provider, deposit_reference, account_reference, account_number, amount_kobo,
charge_kobo, event_key, payload)` (service role only), one transaction:

1. Store the event key first (`payment_events`); a repeat → `duplicate`, writes nothing.
2. Find the deposit account by reference **and** account number (both must match); unknown →
   `unknown_account` (logged; the reconciliation surplus shows it to an admin).
3. Lock the business's `users` row (lock order §6.6: users → engagement → payment).
4. Post one `deposit_received` group: provider cash `+(amount − charge)`, `business_wallet
   −(amount − charge)`. The business carries Cray's transfer charge (§3): it never touches our
   accounts, and the wallet is credited what actually arrived. `amount` here is what the business
   sent and `charge` Cray's charge; if the webhook gives only gross and net, charge = gross − net.
   **Verify in sandbox** which fields Cray sends (the reviewer's point: if `amount` is already net,
   don't subtract the charge twice). Store gross, charge and net in the payload for the trail.
5. Find this business's open **transfer** payments (`method='transfer'`, status `initiated`, hire
   still `awaiting_payment` and not lapsed per `engagement_lapsed`), oldest first. For each, if the
   wallet now covers its total, fund the hire through the **same internals as `pay_from_wallet`**
   and close that payment as succeeded, with processor charge 0 on our side (the business carried
   it), so a creator-fault refund returns price + fee in full and stays break-even for us. Stop at
   the first one the wallet can't cover.
6. Return one outcome per deposit for the notification: `funded` (exact), `funded_with_extra`
   (wallet left over), `short` (a transfer payment is waiting and the wallet doesn't cover it —
   include the amount still needed), `hire_ended` (a transfer payment existed but its hire lapsed or
   was cancelled), `credited` (no transfer payment waiting).

A deposit **never** funds a hire the business didn't start a transfer payment for: the fee notice
must have been seen (§6.2 rule). If they have a waiting hire without a transfer payment, the
`credited` notice says so and links to pay from the wallet.

**Notifications** (new kind `deposit_received`, facts: amount sent, Cray's charge, amount credited,
outcome, engagement id/title if any, amount still needed, wallet balance after; emailed `always`;
words in `src/lib/notifications.ts`). Every message states the charge:
- funded: "We received ₦52,700 (₦200 bank charge). Your hire with <creator> is paid."
- funded_with_extra: "We received ₦60,000 (₦200 bank charge). Your hire is paid and the extra
  ₦7,300 is in your wallet."
- short: "We received ₦40,000 (₦200 bank charge). This hire needs ₦52,500, so ₦12,700 is still to
  pay. The ₦39,800 is in your wallet and will be used first."
- hire_ended: "We received ₦52,500, but the hire had already <lapsed/been cancelled>. The money is in
  your wallet."
- credited: "₦X was added to your Pitchype wallet."
The existing `hire_funded` notices to the creator fire as for any funding.

**Who pays the charges:** every transfer costs the business Cray's charge (≤ ₦200), including a
second transfer after an underpayment and a transfer with no hire behind it. Pitchype pays none of
them. ("Still to pay" amounts add the ₦200 allowance again for the next transfer.)

### 5.4 Payouts on Cray

**Bank details.**
- `bank_accounts` becomes one row **per user per provider**: add `provider` (backfill `paystack`),
  replace `unique (user_id)` with `unique (user_id, provider)`, make `recipient_code` nullable
  (required when provider = paystack, via a check), add `account_number_encrypted text` (required
  when provider = cray).
- Creator wallet page shows and edits the bank account for the **active** provider, with that
  provider's bank list (`GET /payout/banks`, NIP-style 6-digit codes — Paystack's codes don't carry
  over). Saving on Cray: `POST /payout/accounts/validate` → show the resolved name → save through a
  service-role function (as `save_bank_account_for()` today) with last4, name, bank, code and the
  encrypted number. Rate limit as today (`money-limits.ts`).
- If a creator has bank details only for the other provider, the wallet shows "Add your bank details
  again" with one line on why (we changed payment provider).

**Encryption** (`src/lib/account-crypto.ts`, the only code that encrypts/decrypts):
AES-256-GCM, random 12-byte IV, key from `BANK_ACCOUNT_ENCRYPTION_KEY` (32 bytes, base64), stored as
`v1:<iv b64>:<tag b64>:<ciphertext b64>` so the key can be rotated later. Decrypt only on the server
in the payout send path. The plaintext never reaches a log, an error message, the browser, a
notification or the payout payload stored in the database. Unit tests: round trip, tamper detection,
wrong key, malformed input.

**Requesting.** `request_payout()` snapshots the active provider's bank account onto the payout
(`provider`, bank code, bank name, last4, account name, recipient code *or* encrypted number) and the
provider's transfer cost (§5.7). A creator with no bank details for the active provider can't
request.

**Approving and sending** (admin, `/admin/money/payouts`):
1. Before `approve_payout()`, the server runs a **fresh** `accounts/validate` (Cray's `ref_id` is
   short-lived and required by disburse). If the returned name doesn't match the snapshotted name
   (case/space-insensitive), refuse approval with a message; the admin can reject with a reason.
2. `approve_payout()` → `processing`, reference `pit_po_<32 hex>` (unchanged).
3. `POST /payout/disburse` with `customer_reference` = our reference, `amount` =
   `koboToNaira(amount_kobo − transfer_fee_kobo)`, `currency: "NGN"`, `bank_code`,
   `account_number` (decrypted), `recipient_name`, `ref_id`, `narration: "Pitchype payout"`.
4. Store Cray's `data.reference` on the payout (`provider_reference text`, unique, set once) through
   a service-role function.

**Money not in the Main Balance yet.** Cray pays payouts only from its *Main Balance*; card and
transfer money sits in a *Settlement Balance* until the next working day (Cray, 2026-11-21). The
approval screen shows Cray's current Main Balance next to the payout. A disburse refused with
"Insufficient balance" (HTTP 400) means **nothing was sent**: the payout stays `processing` with a
`waiting_for_funds` flag, and the daily money check and the admin's "Check with Cray" button retry
it (fresh validate, same `customer_reference`). It is never failed for this reason.

**Reversed after paid (owner's decision 2026-11-21: re-credit automatically).** If Cray's requery
says `reversed` for a payout we already recorded as `paid`, the money is back in our Cray balance and
the creator wasn't paid. `finish_payout()` gains this one exception to "a contradicting event after
a final state is ignored": only for a Cray payout, only when the verified requery status is
reversed, it moves the payout to a new final status `reversed`, posts a reversing group (provider
cash `+` what Cray returned, `creator_wallet −` the same; if Cray also returned its charge, the
creator gets the full `amount_kobo` back), notifies the creator (new kind `payout_reversed`, emailed
`always`) and shows it flagged on `/admin/money/payouts`. A second reversal event is a duplicate.
What Cray returns on a reversal is **verify in sandbox**; until known, re-credit the amount sent and
let reconciliation show any charge difference.

**Finding out the result.** Cray looks payouts up **only by its own id** (`GET
/payout/requery/{id}`), and it **rejects a repeated `customer_reference`** (Cray agent). So:
- With `provider_reference`: requery; check `merchant_reference` = our reference and the amount
  sent = expected (else log, `ignored`, admin sees it); map status: `approved`/`successful`/
  `success` → paid; `failed`/`reversed`/`declined` → failed; anything else → pending. Unknown status
  strings are logged once and treated as pending — **verify the vocabulary in sandbox**.
- Without `provider_reference` (the send timed out or crashed): the daily money check (and the
  admin's "Check with Cray" button) re-sends disburse with the **same** `customer_reference` after a
  fresh validate. Accepted → store the id. Rejected as duplicate → the payout is marked
  `needs_reference` (new boolean or note on the payout) and **stays `processing`**. The admin finds
  the payout in Cray's dashboard and pastes Cray's id ("Attach Cray reference", admin-only function,
  only while `provider_reference` is null); the next check verifies it via requery (merchant
  reference must match) before anything settles.
- **A Cray payout is never failed by the 15-minute "not found" rule.** That rule stays for Paystack
  only. A Cray payout fails only when Cray's requery says failed/reversed.
- `payout` webhook (unsigned): read `data.reference` (Cray's id), find our payout by
  `provider_reference`, then `confirmTransfer` (requery). Never trust the body's status.
- `finish_payout()` keeps its idempotency rules and posts to the payout's provider cash account.

### 5.5 Webhook route `/api/webhooks/cray`

- Read the raw body, parse JSON. Events:
  - `collection.virtualaccount.successful` → **must** pass the signature check, then
    `record_deposit`. Event key `cray.deposit:<transaction_reference>`.
  - `payin` / other `collection.*` carrying a `pit_` reference → hint → `confirmCardPayment`.
  - `payout` → hint → `confirmTransfer` by Cray id.
  - Anything else → 200 `ignored`.
- **Signature** (`collection.*` only): `hash = base64(HMAC-SHA256(JSON of data, webhook key))`.
  Pick the key by the `Cray-Webhook-Key` header (last 4 chars); support up to two keys
  (`CRAY_WEBHOOK_KEYS`, comma-separated) for rotation; constant-time compare. Cray signs *its own
  serialisation* of `data` and tells Node users to `JSON.stringify(parsed.data)`. **Verify in
  sandbox** with a real delivery containing a URL and non-ASCII text; if PHP-style escaping (`\/`,
  `\uXXXX`) breaks the match, try that variant too and document which one Cray uses. A failed
  signature on a `collection.*` event → 401, nothing written.
- Status codes as the Paystack handler: 200 stops retries; 5xx on a provider/database outage or a
  charge still pending. Failed deliveries can be retried from Cray's dashboard.
- `sendEmailsAfterResponse()` after a 200, like the Paystack route.

### 5.6 Ledger and reconciliation

- New ledger accounts: `cray` (cash, positive), `cray_fees` (expense, positive), `bank` (cash
  outside any provider: our own bank account). Widen the account check constraint in a new
  migration; update `lib/ledger-words.ts`, filters, CSV and the trail check.
- New event types: `deposit_received`, `processor_fee` (Cray charges; Paystack keeps writing
  `paystack_fee` unchanged), `cash_moved`.
- Every money function that posts to `paystack` / `paystack_fees` today posts to the **row's
  provider** accounts instead (`record_card_payment`, `finish_payout`, the fault-refund charge lookup
  in `settle_money` keeps reading the funding payment's charge — unchanged in meaning).
- **Payout paid on Cray:** cash out of `cray` = amount sent + Cray's actual `charge` (from requery).
  If that differs from the payout's `amount_kobo` (the creator's snapshotted transfer fee ≠ Cray's
  real charge), book the difference in the same group to `cray_fees` (we absorb or keep it); never
  charge the creator after the fact.
- **Cash moved between places** (e.g. the owner tops up Cray from the bank so Paystack-collected
  money can be paid out): admin-only `record_cash_movement(from, to, amount, reason)` between
  `paystack`, `cray` and `bank`, one balanced `cash_moved` group, reason required. Small form on
  `/admin/money`. Without it, per-provider reconciliation can't stay true once the switch is used.
- `reconciliation_runs` gains `provider`. The daily money check records **one run per provider whose
  credentials are set**: expected = that provider's cash account balance from the ledger; actual =
  provider balance (Paystack `/balance`; Cray `GET /balance?currency=NGN`: Cray returns the *Main
  Balance* and the *Settlement Balance* as separate NGN accounts — sum both, using
  `actual_balance` where present, else `available_balance` (+ `locked_balance`), and write each part
  into the run's `note`; Cray documents `data` both as an array and as `{accounts: [...]}` — handle
  both). The whole-ledger "sums to zero" check stays as is. `/admin/money` shows the latest run per
  provider.

### 5.7 Fees

- New `fee_config` version row (rows are never edited) with per-provider processor data, e.g. a new
  `provider_fees jsonb` column: `{ "paystack": {card…, transfer tiers, stamp duty},
  "cray": {"card": {"rate_bps":150,"cap_kobo":200000}, "transfer_in": {"rate_bps":100,"cap_kobo":20000},
  "payout": {"tiers":[{"up_to_kobo":null,"fee_kobo":5000}], "stamp_duty_kobo":0}} }`. The Cray numbers
  are the support agent's ("usually", "~1%"): treat as **provisional**, put a TODO for the owner to
  get them in writing. Builder decides the exact column shape; `src/lib/fees.ts` mirrors it and
  `fee-config.test.ts` keeps them equal.
- Payout transfer cost = the payout provider's figure (Cray: flat ₦50 placeholder, no stamp duty
  unless Cray confirms it), shown before the creator confirms, as today.
- **Fee tests:** the Paystack invariant test (business fee > Paystack's charge) stays as is. On
  Cray, charges are carried by the business (§3), so the test instead asserts that on every Cray
  path no processor charge lands in our accounts: card funding posts the full total to escrow +
  revenue, a deposit credits net of charge, and a creator-fault refund on a Cray hire returns
  price + fee with nothing left over. The profit table in CLAUDE.md §6.4 gets a Cray column
  (completed ₦50,000 job: ₦5,000).

## 6. Security

- Env vars (server only, add names to `.env.example`, document in PROVIDERS.md):
  `CRAY_BASE_URL` (sandbox `http://sandbox.crayfi.io` per docs — **try https first in sandbox**;
  live `https://pay.crayfi.io`), `CRAY_COLLECTION_API_KEY`, `CRAY_DISBURSEMENT_API_KEY`,
  `CRAY_WEBHOOK_KEYS`, `CRAY_SIGNING_PRIVATE_KEY` (PEM, P-256), `CRAY_SIGNING_KEY_ID`,
  `CRAY_SUBACCOUNT_TOKEN`, `BANK_ACCOUNT_ENCRYPTION_KEY`. `GET /balance` works with either key; use
  the collection key.
- Request signing (`cray.ts`): canonical string `METHOD\npath[?canonical query]\nt\nn\nsha256hex(body)`
  with `t` in **milliseconds**, `n` a fresh UUID per request (and per retry), body hashed as the exact
  bytes sent (serialise once, send that string). Header `t=…,n=…,kid=…,v1=<base64 DER sig>`. Unit
  test against the docs' worked example (body `{"amount":1000,"currency":"NGN"}` →
  hash `6469249697a442b13fd6384708be6aede58b356f534aee1549b252ef370a3e36`) and verify the signature
  with the matching public key in the test.
- `safeMessage()` equivalent strips every Cray key and masks 10+ digit runs.
- Account numbers: §5.4 encryption; never logged; masked in UI.
- Unsigned events never move money on their own (§5.5).

## 7. Admin and UI touch list (all on existing design-system components; check at 390px)

- Business pay page: card / bank transfer choice, transfer account panel with copy button and exact
  amount, provider-neutral copy (no "Paystack" in user-facing text).
- Business wallet page: shows the transfer account if one exists, and deposit rows in the history
  (ledger words: "Bank transfer received").
- Creator wallet page: bank form per active provider; "add your bank details again" state.
- Admin: `/admin/money/provider` (new page + skeleton), provider shown on payments, payouts, ledger
  filter and reconciliation; payouts page gets "Check with Cray" and "Attach Cray reference"; the cash
  movement form; reconciliation per provider.

## 8. Testing (CLAUDE.md §6 rule 10 and §9)

- **Unit (node):** naira↔kobo; request signing (worked example); webhook hash verify (good, bad,
  wrong key hint, rotation); account encryption; status mapping; `handleCrayWebhook` decisions with
  fakes (signed deposit, unsigned deposit refused, payin hint, payout hint, outages → 5xx);
  `confirmTransfer` for Cray (no reference → resend; duplicate → needs_reference; never auto-fail);
  fee config equality and the per-provider invariant.
- **pgTAP:** provider switch (admin only, append-only, refuses bad values), `start_payment` stamps
  the active provider, a started payment keeps its provider after a switch, `record_deposit` (each
  outcome, duplicate event, unknown account, wallet never negative, groups balanced, lapsed hire),
  bank accounts per provider and the encrypted-number check, payout provider reference set once,
  `finish_payout` on Cray posts to `cray`, fee-difference booking, cash movement balanced and admin
  only, RLS on the new tables, reconciliation per provider.
- **money-race.mjs** (new scenarios): the same deposit webhook twice at once; a deposit against the
  lapse; a deposit against the business cancelling; a deposit against a card payment for the same
  hire; two deposits for one hire at once; the switch flipped during `start_payment`; the disburse
  re-send against the payout webhook.
- **Existing suites stay green** — the Paystack path must keep working untouched.
- **Sandbox end-to-end (the owner provides sandbox credentials):** card payment → funded; transfer
  exact / short / extra / no hire; payout → paid; payout failure → wallet re-credited; webhook
  signature on a real delivery; the `verify in sandbox` items in this doc. The builder writes
  `scripts/sign-cray-webhook.mjs` (like `sign-webhook.mjs`) for local tests.

## 9. Left to the builder

- Exact column shapes (`provider_fees`, `needs_reference`), function names, and whether
  `method='wallet'` exists — following the invariants above.
- **Names:** keep `paystack_fee_kobo` (column), `paystack`/`paystack_fees` (accounts) and
  `paystack_fee` (event) as they are; comment that `paystack_fee_kobo` now means "the processor's
  charge on this payment, whichever provider". Add a TODO to rename later. Rewriting every function
  that references them isn't worth the risk now.
- Migration split (one concern per file), commit split, and whether `src/lib/processor.ts` earns its
  place (§4.1).
- Docs in the same change: CLAUDE.md (§2, §3 table, §4 layout, §6.3, §6.6, §7, §12 decisions),
  `docs/PROVIDERS.md` (a Cray section; Paystack section notes it's kept but not default),
  `docs/TODO.md` (owner tasks below), `.env.example`.

## 10. Owner tasks (go in docs/TODO.md)

- Create a Cray sandbox account; complete KYC; create API keys (collection, disbursement, webhook);
  generate and register the ES256 signing key; note the `kid`; get the subaccount token.
- Set the webhook URL `https://<domain>/api/webhooks/cray` and enable webhooks in the dashboard.
- Dashboard → Settings → Settlement Configuration: settle to the **Main Balance**, not a bank
  account (otherwise collected money leaves Cray, the Paystack problem again).
- Ask Cray again whether a Bloc permanent account needs a BVN (§5.3).
- Get Cray's fees **in writing** (card, transfer-in, payout; whether stamp duty applies).
- Generate `BANK_ACCOUNT_ENCRYPTION_KEY` (`openssl rand -base64 32`) per environment and keep a
  copy somewhere safe: losing it means every creator re-enters bank details.
- Compliance flag (CLAUDE.md §6.4) still open: confirm with a lawyer and Cray how holding third-party
  funds and business wallet balances must be structured.

## 11. Risks

- Signature re-serialisation mismatch on deposit webhooks (§5.5) — would block deposits; caught in
  sandbox.
- A missed deposit webhook has no API backstop; reconciliation surplus + Cray dashboard redelivery is
  the recovery path.
- Cray's status vocabulary for payouts isn't fully documented; unknowns are pending, never failed.
- Fees are provisional until confirmed.

## 12. Cray support agent's answers (2026-11-21, verbatim facts used)

1. Permanent account deposit webhook `collection.virtualaccount.successful` carries `data.recipient`
   (receiving account number), `data.customer_reference` (our account reference),
   `data.transaction_reference` (Cray's deposit id). No "list deposits for one account" endpoint.
2. Hosted checkout webhooks carry our reference as `reference` or `merchant_reference`, Cray's as
   `transaction_reference` or `processor_reference`.
3. `GET /payout/requery/{transaction_id}` needs Cray's id; our `customer_reference` can't be used.
   A repeated `customer_reference` (successful or pending) is rejected as a duplicate.
4. Fees: NGN cards 1.5% capped ₦2,000; NGN transfers ~1% capped ₦100–₦200; NGN payouts flat ~₦10–₦50.
   Payout charge is taken on top from the wallet (send ₦10,000 + ₦50 fee → wallet −₦10,050);
   collection charges are deducted from the inflow.
5. Checkout query always needs the Bearer key; the signature is needed when signing mode is Required
   (the default).
6. One-time accounts reject wrong amounts (they stay pending at Cray and need Cray support), which is
   why transfers use permanent accounts.
7. Settlement destination is set in Dashboard → Settings → Settlement Configuration (bank or Main
   Balance). `GET /balance` returns the Main Balance and the Settlement Balance as separate accounts.
   Payouts, bill payments and conversions always debit the Main Balance; the Settlement Balance
   can't be spent until it settles (next working day, or a manual trigger on some tiers).
