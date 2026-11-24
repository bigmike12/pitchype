# Pitchype Internal AML/CFT and Fraud Policy

**DRAFT v0.1 for legal review and approval. Not in force.** Drafted 2026-11-24 from the escrow, ledger, auto-release and payout code on `main`. Where this policy says what happens today, it has been checked against the code. Where it says what should happen, the item is in the gap register (section 13) and the automated-check list (section 12). `[Square brackets]` mark decisions still open.

**Audience:** founders, admins who approve payouts, the compliance lead, engineers who build the checks, and counsel.
**Owner:** `[compliance lead]`. Approval and review dates are at the end.

> **Status and limit.** This is a policy framework. It does not decide whether Pitchype is a bank, an escrow agent, a payment service provider, or a reporting entity under Nigerian law. The compliance flag in the project's rules (CLAUDE.md §6) still applies: the holding of funds for others and the payouts made from them must be confirmed with counsel and with Paystack before launch, and any licence or registration needs settling first. Nothing in this policy is legal advice.

## 1. Purpose, scope and principles

This policy sets out how Pitchype prevents, finds, escalates and responds to money laundering, terrorist financing, sanctions risk and fraud on the marketplace. It covers every hire, payment, wallet movement, payout, refund, dispute and account that touches money.

Principles:

- **Risk-based.** Checks are proportionate to the amount, the pattern and the people involved.
- **Verified money only.** Amounts and states come from the server's ledger and from verified provider answers, never from the client.
- **Nothing held or paid on a hunch.** A hold is per payment, with a written reason, and it can be reviewed (CLAUDE.md §6.5). A strike is never a reason to hold money.
- **No tipping off.** Staff must not tell a person that they are the subject of a review or report.
- **Every decision leaves a record.**

## 2. Legal framework (for counsel to confirm)

These laws and bodies are believed to be relevant. `[Counsel: confirm which apply, how, and what Pitchype's duties are.]`

- Money Laundering (Prevention and Prohibition) Act 2022.
- Terrorism (Prevention and Prohibition) Act 2022, including targeted financial sanctions.
- Central Bank of Nigeria AML/CFT rules and guidelines for payment service providers and other regulated entities, and any licence conditions that would apply.
- Special Control Unit against Money Laundering (SCUML) registration rules for designated non-financial businesses and professions, if they apply.
- Nigerian Financial Intelligence Unit (NFIU): the channel for suspicious transaction reports, if a reporting duty applies.
- Nigeria Data Protection Act 2023 (NDPA): limits what we may collect and keep for screening, and applies to every check in this policy. See the [internal data protection policy](2-internal-data-protection-policy.md).

## 3. Roles

- **Compliance lead:** owns this policy, triages alerts, decides escalations, and keeps the alert register.
- **Admins (payout approvers, dispute deciders):** apply section 6 and section 8 and raise alerts. They must not approve a payout or decide a dispute where they have a personal or business link to the person (see section 6.4).
- **Engineering:** builds and tests the automated checks in section 12, and keeps the reconciliation job running.
- **Data protection lead:** reviews any new data used for a check.
- **Counsel:** advises on reporting, holds, refusals and exits.

## 4. How money moves on Pitchype (as built)

Each step lists the control that is in place today. Controls not yet in place are listed in section 13.

| # | Step | What happens | Control in place today |
|---|---|---|---|
| 1 | **Sign-up** | Business or creator signs up with an email and password, then fills in a profile. | Rate limits on sign-up and sign-in. One role per account. Admins are created by hand. **No identity, business registration, sanctions or PEP check.** |
| 2 | **Campaign published** | A business publishes a campaign. A first campaign waits for admin approval. Per-click campaigns always go to review. | Admin review of first and per-click campaigns. Contact details are refused in the brief. Takedown and reports. |
| 3 | **Application and hire** | A creator applies (may propose a price). The business approves; this creates an awaiting-payment hire. | Eligibility is checked on the server. A proposed price that changed since the business looked is refused. |
| 4 | **Payment** | The business pays the price plus the business fee, from its wallet first and by card for the rest. Card payments go to our Paystack balance and are recorded as escrow for the hire. | The server verifies each payment with Paystack before recording it. Amount or currency mismatches are logged, not applied. Reversed charges are treated as failed. A payment after the hire lapsed goes to the business wallet (a stranded payment), and the business is told. |
| 5 | **Work** | The creator submits links, up to 5 screenshots and a note. | Submissions limited to 10 an hour. Screenshots in a private bucket. Contact details refused in notes. |
| 6 | **Review and auto-release** | The business accepts, or denies with reasons. If the business doesn't respond within 7 days of a submission, the daily job releases the hire to the creator. | Auto-release uses the same settlement function as manual acceptance, so a second release is a no-op. Reminders at 3 days and 1 day left. |
| 7 | **Dispute** | Either side may dispute. An admin decides: release in full, refund in full, or split. | One open dispute per hire. Opening limited to 5 a day per person. Nothing settles while a dispute is open. |
| 8 | **Wallets** | A creator's wallet receives releases (after the 5% fee) and refunds. A business's wallet receives refunds and stranded payments only. There are no top-ups and no business withdrawal yet. | Ledger is append-only, grouped and balanced. Wallets can't go negative. Business withdrawal is not built; a refund to a bank is done by hand. |
| 9 | **Payout** | A creator requests a payout (minimum ₦1,000). The request is held for admin approval, then sent as a Paystack transfer. | Balance checked under a row lock. Limited to 5 requests in 10 minutes. Every payout needs admin approval. The destination is fixed when requested. A failed transfer is re-credited to the wallet only after Paystack confirms the failure. |
| 10 | **Reconciliation** | A daily job compares the expected cash with Paystack's balance and records the result. | Differences show on the admin money page. Stuck payouts are retried by the same job. |
| 11 | **Pay per click** | Clicks on a creator's tracked link are counted until the deliver-by date. After a 72-hour hold, the hire settles on billable clicks only. | Billable-click rules, once per visitor per link per day, rate limit per visitor, bot filtering, lock order for settlement. |

## 5. Customer due diligence

### 5.1 What we hold today

- **Businesses:** business name, contact name, state, city, verified email. No business-registration check. No owner identity check.
- **Creators:** display name, state, city, platforms with self-reported follower ranges, optional verification of a handle through a one-time code in the bio (recorded by an admin). No legal name is collected on `main`. The only name check is the account name Paystack returns when a payout account is checked.
- **Neither:** sanctions screening, PEP screening, source-of-funds information.

### 5.2 Planned

The identity verification work (on the unmerged `identity-verification` branch) would add: a creator's legal name, NIN and a live selfie; an unregistered business owner's legal name, BVN and selfie; and a registered business's CAC record. It would also add one sanctions and PEP screen per person at the first money event. These checks are not live. They must be assessed under the data protection policy before they ship (DPIA).

### 5.3 Risk tiers (proposed; limits not approved)

| Tier | Who | Minimum before they can use money | Limits |
|---|---|---|---|
| 1 | Any account that has not been paid or hired | Email verified, profile complete | No payouts. Hires under `[amount]`. |
| 2 | A creator who can be paid, or a business that can hire | Identity or business check (planned), and a payout account whose name Paystack has checked | `[Per-hire and monthly limits]` |
| 3 | High-value or flagged accounts | Enhanced due diligence: documents, source of funds where needed, admin sign-off | Case by case |

`[Compliance lead and counsel: set the tiers, the limits and the triggers for moving an account up or down.]`

### 5.4 Ongoing monitoring

Each account's pattern is reviewed by the automated checks in section 12. An account moves to Tier 3 when a high-priority alert is confirmed.

## 6. Payout review (manual, admin)

Every payout is approved by an admin before any transfer. This is the main human control on money leaving the platform. Use this checklist for each payout request. Record the outcome on the payout.

### 6.1 Checks

1. **Request.** The payout is still `requested`. It is not a duplicate of another open request. It was made within the normal rate limit.
2. **Entitlement.** The amount is no more than the creator's wallet balance on the ledger. The credits in the wallet trace back to released hires (open the creator's wallet statement and the hire trail for each recent credit).
3. **Amount and fee.** Amount meets the ₦1,000 minimum. The transfer cost shown to the creator matches the fee table. The destination on the payout matches the bank account it was requested with.
4. **Destination.** The account name Paystack returned is recorded. Look at when the bank account was last changed (`bank_accounts.updated_at`). A change within the last `[24]` hours is a red flag (section 7, R13). Note: the old account is overwritten, so only the last change date is visible today (G8).
5. **Hire pattern.** Look at the hires behind the credits. Note any auto-released hires, any disputes in the last 30 days, and any repeated pairing with the same business.
6. **Standing.** Strikes, suspensions, open appeals.
7. **Open alerts.** Any open alert on the creator, the business on the same hires, or the payment references.
8. **Decision.** Approve, or reject with a written reason. A rejection returns the money to the wallet. Escalate instead of deciding when any check raises doubt. Do not tell the creator the reason for an escalation (section 10).
9. **Second approval.** `[Amount above which a second admin must approve.]` Not built yet (G7).

### 6.2 Approval record

The database records who approved, when, and any rejection reason. Keep the admin's note in the alert register if the payout was escalated or held.

### 6.3 Holds

A payout can be held for review, per payment, with a written reason. A held payout should be visible to admins, and to the creator as "being checked". `[Wording to be approved.]` A hold is not a suspension and does not change wallet balances. There is no hold mechanism in the code yet (G10).

### 6.4 Conflicts of interest

An admin must not approve a payout, or decide a dispute, for a person or business where they have a personal, family, or business link. Admins declare any link in the alert register before acting. `[Compliance lead: set the declaration form and the review cycle.]`

### 6.5 Timing

`[Target time to decide a payout request, and what happens to an undecided request. Today a request waits until an admin acts.]`

## 7. Red flags and where they would show in our data

Each red flag lists where it would appear, what we do today, and the check we propose. Priority: P1 before launch at scale, P2 within the first quarter after launch, P3 later.

| ID | Red flag | Where it shows | Today | Proposed check | Action | Priority |
|---|---|---|---|---|---|---|
| R1 | **Structuring**: many small payments, or payments just under a limit | `payments`, `engagements`, `ledger_entries` | Not detected | Count and total of payments per business per day and per week; alert above `[thresholds]` | Alert, then review | P2 |
| R2 | **Quick in-and-out**: money paid in and paid out again, or a refund cycled into a payout | `ledger_entries` (business refunds, creator releases), `payouts` | Not detected | Alert when a creator requests a payout within `[24]` hours of a release from the same business pair, or of a refund into a wallet linked to them | Alert; hold for R13 | P2 |
| R3 | **Related parties**: business and creator are the same person or linked | `bank_accounts` (last four digits only), IP-based rate-limit keys (G1), click hashes | Not detected. One role per account only. | Keyed HMAC of the full account number at save (never stored in full), to find the same account under two users. Later, linked sign-ups by IP hash, once G1 is fixed. | Alert, then review | P1 |
| R4 | **Shared payout account** across creators | `bank_accounts` | Not detected (the table holds one row per creator with no account fingerprint) | As R3. The fingerprint must be added at save time, because the full number is not kept. | Alert; hold if the account is linked to a flagged account | P1 |
| R5 | **Colluding or fake work**: work accepted within minutes of submission, or the same pair repeatedly | `submissions` (timestamps), `engagements` | Not detected | Alert when a business accepts within `[X]` minutes of submission on `[N]` or more hires, or when the same pair shares more than `[X]%` of each other's hires | Alert, then review | P2 |
| R6 | **Auto-release pattern**: a business that repeatedly lets work auto-release, or a creator whose hires always auto-release | `engagements.status = auto_released` | Recorded, not alerted | Monthly report of the auto-release rate per business and per creator, with a threshold alert | Alert; review limits | P2 |
| R7 | **Dispute abuse**: one person opening many disputes, or disputes that end in a split repeatedly | `disputes`, `dispute_statements` | Opening limited to 5 a day | Count per person and outcome per pair; alert above `[threshold]` | Alert | P3 |
| R8 | **Repeated stranded payments**: a business keeps paying after a hire lapsed or was cancelled | `payments` with wallet credit, `payment_stranded` notice | Business is notified; no alert | Count per business; alert above `[threshold]`. Consider limiting wallet use for that business. | Alert | P2 |
| R9 | **Third-party payer**: card paid by someone other than the business | Paystack transaction data (the customer details are discarded today) | **Not checked** | Keep a keyed HMAC of the payer's email at verification. Alert when it doesn't match the business's email. | Alert | P2 |
| R10 | **Amount or currency mismatch, reversed charge** | Payment verification logs | Logged only (console error); reversed charges are treated as failed | Put each mismatch in a review queue visible to admins, not only in logs | Queue and alert | P1 |
| R11 | **Chargeback**: a business's bank reverses a card payment | Paystack dispute events | **Not handled.** The webhook handles only payment and transfer events. | Add Paystack's dispute events to the webhook (names to confirm against Paystack's documentation). Record the chargeback as a ledger correction, hold related payouts, and alert. | Hold and alert | P1 |
| R12 | **Duplicate or fake accounts** | Sign-up data (email only) | Rate limits only | After identity checks are live, one fingerprint per legal identity. Before then, alert on several sign-ups linked by IP hash. | Alert | P2 |
| R13 | **Account takeover**: a bank change followed by a payout | `bank_accounts.updated_at` (no history kept) | Not detected | Keep an append-only history of bank changes. Hold a payout requested within `[24]` hours of a change, and alert admins. Require a fresh check after a password reset. | Hold and alert | P1 |
| R14 | **Off-platform payment**: a request to pay outside the escrow | Chat, briefs, bios, applications, submissions, dispute statements | Contact details (phone, email, WhatsApp and Telegram links) are refused and count as strikes | Also flag bank account numbers (10 digits) and phrases such as "pay me directly" or "transfer to". Send screenshots that may contain contact details to manual review. | Hold for review; strike under §6.5 of CLAUDE.md | P3 |
| R15 | **Sanctioned or PEP party** | Not screened | **Not screened** | Screen once per person at the first money event (planned, section 5.2). Counsel to set the list and the response. | Hold and escalate on a confirmed match | P1 |
| R16 | **Admin misuse**: approving a payout or deciding a dispute with a conflict, or bulk approvals | `payouts.approved_by`, `disputes.closed_by`, admin action records | One admin approves; no conflict check; admin reads are not logged | Second approval above a threshold; conflict declarations (6.4); log admin reads of personal data; alert on bursts of approvals | Alert; second approval | P1 |

## 8. Escrow, auto-release and dispute controls (AML view)

- **One way out of escrow.** Every release, refund or split goes through the single settlement function, which writes a balanced group of ledger entries and changes the hire's state in one transaction. Repeats are no-ops. Money-race tests cover the paths where two callers could reach the same money.
- **Auto-release is a payment without the business's approval.** It is allowed by the terms, but it is a risk: a shell business could let work lapse so that money goes to a colluding creator. The monthly auto-release report (R6) is the control. `[Compliance lead: set the review sample, e.g. every auto-released hire over `[amount]` in the month.]`
- **Refunds to the business wallet, not a bank,** keep cash inside the platform, but they create a balance the platform owes. Until a business withdrawal is approved and built, a manual refund to a bank is a two-person task `[to decide]`, with the reason recorded.
- **Dispute outcomes** are recorded with the admin's written reason. An admin who decides a dispute must not approve a payout for the same hire (6.4).

## 9. Ledger and wallet controls

- The ledger is append-only. Corrections are reversing groups with a reason. Nothing is edited or deleted.
- Each group must balance. A wallet can't go negative. Tests cover both.
- The daily reconciliation compares the expected cash, computed from the ledger, with Paystack's balance. A difference, or a ledger whose accounts don't sum to zero, is shown as a callout on the admin money page. `[Compliance lead: set who is alerted and how fast.]`
- Monthly, an admin who did not post the entries reviews a ledger export and the reconciliation record. `[Confirm the owner.]`
- Manual money movements (for example, a refund by hand) are done as reversing groups in the database, with a reason. `[Confirm whether there is a screen for this; on `main` there is none in the admin money area.]`

## 10. Alerts, investigations and escalation

### 10.1 Sources of alerts

Automated checks (section 12); admin observations; user reports; Paystack's notices; the daily reconciliation; a provider or bank request.

### 10.2 Alert register

Every alert gets an ID, date, source, the accounts and references involved, the facts, the decision, and who decided. Today strikes are recorded in `moderation_events`, but there is no alert register for money. Building one is a decision for the compliance lead (section 13, G11). Until then, keep a register in the agreed tool `[location]`.

### 10.3 Triage

- Triage within `[two]` working days. High-priority alerts (R3, R4, R11, R13, R15, R16) same day.
- Review the facts: the ledger trail, the hires, the payouts, the standing, the other side's history.
- Outcome: close with a reason; restrict the specific payment or payout; request information; or escalate to the compliance lead.

### 10.4 Restrictions

- Restrictions are per payment or per payout, with a written reason, reviewable, and written to the ledger or the alert register. They never change escrow or wallet balances by themselves.
- Suspension under the enforcement rules does not take money: running work, escrow and payouts carry on (CLAUDE.md §6.5). A money-related hold is separate and is decided under this policy. `[Counsel: confirm how the two interact.]`

### 10.5 Reporting

Counsel decides whether a report to the NFIU or any other authority is required, and through which channel. The compliance lead prepares the file. Record the decision and the reason even when no report is made. `[Counsel: set the timing.]`

### 10.6 No tipping off

- Staff must not tell a person that they are under review, that an alert exists, or that a report has been or will be made.
- User-facing words for a hold must be neutral. For example: "We're checking this payout. We'll be in touch." `[Wording to be approved by counsel.]`
- Do not discuss a case with the person it concerns, or in a shared channel.

### 10.7 Exit and refused accounts

When an account is closed for money reasons, funds are handled under the law and counsel's written instruction. Do not refund to a card or bank without counsel's approval. Where balances are owed to the creator, pay out only after the checks in section 6. `[Counsel: confirm.]`

## 11. Records and retention

- Keep: the ledger; payouts and their approvals; reconciliation records; alerts and decisions; disputes and their reasons; identity and screening results once they exist; and bank-change history once it exists.
- Retention: `[at least six years from the end of the relationship, or longer if counsel advises]`. No deletion while a legal hold or an open alert applies.
- Records must not be altered to hide activity. Corrections are new entries with a reason.

## 12. Automated checks to add

These are the checks that this policy needs. Each lists the place in the system where it would run. Blocking is used only where the risk is clear and a hold is safe. Otherwise checks alert.

| Priority | Check | Where it runs | Output |
|---|---|---|---|
| P1 | Payout hold when a bank account changed in the last `[24]` hours (R13). Needs a bank-change history table. | `request_payout()` and a new change-history write in `save_bank_account_for()` | Held payout, admin queue |
| P1 | Keyed fingerprint of the bank account number at save, checked against other creators (R3, R4). | `save_bank_account_for()` (the server has the full number for a few seconds during the check) | Alert on a match |
| P1 | Handle Paystack's chargeback and dispute events (R11). | `src/lib/payments.ts` webhook adapter; ledger correction function | Hold on related payouts; alert |
| P1 | Turn amount and currency mismatches into a review queue, not only a log line (R10). | `src/lib/payments.ts` and the payments table | Admin review queue |
| P1 | Second approval for payouts above `[threshold]` (R16, G7). | `approve_payout()` and the payout page | Two approvals recorded |
| P1 | Sanctions and PEP screen at the first money event (R15). | Identity check flow (planned); a new boundary file | Hold and escalate on a match |
| P2 | Structuring and velocity checks per business and per creator (R1, R2). | A daily job alongside `money-checks` | Alert |
| P2 | Same-pair and fast-accept checks (R5). | Daily job over `submissions` and `engagements` | Alert |
| P2 | Auto-release rate per business and creator (R6). | Daily job | Monthly report and alert |
| P2 | Payer-email fingerprint versus business email (R9). Keep only the keyed hash. | `record_card_payment()` (through the server's verify step) | Alert on mismatch |
| P2 | Stranded-payment count per business (R8). | Daily job | Alert |
| P3 | Dispute counts and outcome patterns (R7). | Daily job | Alert |
| P3 | Payment-solicitation phrases and account-number patterns in chat and submissions (R14). | Check functions next to `contact_detail_kind()` | Hold for review, and strike rules |

**Where to be careful.** Each new check reads personal data. Before building one, record it in the data protection policy's data map, and state the purpose and retention. The IP-based checks depend on fixing gap G1 in the data protection policy (raw IP addresses kept in rate-limit keys) first.

## 13. Gap register

| ID | Gap | Evidence in code | Priority | Owner / date |
|---|---|---|---|---|
| G1 | Chargebacks not handled | `src/lib/payments.ts` handles only payment and transfer events | P1 | `[ ]` |
| G2 | Amount and currency mismatches only logged | `src/lib/payments.ts` (`console.error`) | P1 | `[ ]` |
| G3 | Single admin approves each payout | `approve_payout()` checks the admin role only | P1 | `[ ]` |
| G4 | No check on bank-account changes before a payout | `request_payout()` does not compare dates | P1 | `[ ]` |
| G5 | Bank-account history is overwritten | `save_bank_account_for()` upserts one row per creator | P1 | `[ ]` |
| G6 | No sanctions or PEP screening | None in code | P1 (before scale) | `[ ]` |
| G7 | No second approver and no amount threshold | As G3 | P1 | `[ ]` |
| G8 | Only the last bank-change date is visible (`updated_at`), so the review in 6.1(4) is weak | `bank_accounts` | P1 | `[ ]` |
| G9 | Admin reads are not logged | No read audit in admin screens | P1 | `[ ]` |
| G10 | No money hold mechanism | None; `hold` does not exist in the schema | P1 | `[ ]` |
| G11 | No alert register for money | Strikes only, in `moderation_events` | P2 | `[ ]` |
| G12 | No structuring, velocity, or related-party checks | None in code | P2 | `[ ]` |
| G13 | Payer not checked against the business | Paystack customer details discarded | P2 | `[ ]` |
| G14 | No manual money-movement screen for admins | Reversing entries are made in the database | P2 | `[ ]` |
| G15 | No business withdrawal, so refunds to banks are manual | Not built (CLAUDE.md §12 item 9) | P2 | `[ ]` |
| G16 | No written triage time, and no list of who decides what | Section 6.5 and section 10.3 are open | P2 | `[ ]` |
| G17 | Money-limits comment says the limiters are in memory; they are counted in the database | `src/lib/money-limits.ts` | P3 | `[ ]` |

## 14. Training, testing and review

- Admins and staff with money access are trained on this policy, the payout checklist, the no-tipping-off rule, and conflicts `[before access, then yearly]`.
- Each new check is tested with a real case, not only a unit test: a payout after a bank change, a repeat bank account under two creators, a chargeback, a mismatched amount.
- The money-race tests cover any new money function that two callers could reach at the same time.
- The policy is reviewed at least yearly, and when the escrow flow, a provider, a payout rule or a limit changes.

## 15. Open decisions for counsel and the owners

1. Whether Pitchype is a reporting entity, what it must report, to whom, and by when.
2. Whether holding funds for others and paying them out needs a licence or registration, or can run within Paystack's terms (CLAUDE.md §6 flag).
3. Risk tiers, transaction and payout limits, and the thresholds in sections 5.3, 6.1 and 12.
4. Second-approval threshold for payouts.
5. The hold window after a bank change (`[24]` hours proposed).
6. Whether business wallet withdrawal to a bank is allowed, and how manual refunds are approved.
7. Retention periods for each record in section 11.
8. Wording of holds and of the user-facing messages in section 10.6.
9. Who owns the alert register and the monthly ledger review.

## 16. Approval

**Approved by:** ________________________ **Role:** ________________________
**Signature:** ________________________ **Date:** ____________

**Related:** [internal data protection policy](2-internal-data-protection-policy.md), [public privacy notice](1-public-privacy-notice.md), and the project's money rules in CLAUDE.md §6.
