# Pitchype Internal Data Protection Policy

**DRAFT v0.1 for legal review and approval. Not in force.** Drafted 2026-11-24 from the code on `main`. Where this policy says what happens today, it has been checked against the code and migrations. Where it says what should happen, the item is listed in section 10 as a gap. `[Square brackets]` mark decisions still open.

**Audience:** founders, engineers, admins, the data protection lead, and counsel.
**Owner:** `[policy owner]`. **Data protection lead:** `[name]`. Approval and review dates are at the end.

## 1. Purpose and scope

This policy sets out how Pitchype handles personal data under the Nigeria Data Protection Act 2023 (NDPA) and the General Application and Implementation Directive issued by the Nigeria Data Protection Commission (NDPC). It covers every system and person listed in this document, and every processor.

It is read with the [AML/CFT and fraud policy](3-internal-aml-cft-fraud-policy.md), which covers the money-related data in more depth, and the [public privacy notice](1-public-privacy-notice.md), which must match what this policy says.

**Roles.** Pitchype is the controller for the personal data of businesses, creators and visitors. The providers in section 3 act as processors for us, except where they keep records for their own legal duties (for example, Paystack's financial records). `[Counsel: confirm the role of each provider and whether Pitchype must register as a data controller of major importance and appoint a DPO.]`

## 2. Data map (record of processing)

This table is the draft record of processing activities (ROPA). "Current retention" means what the system does today. Nothing is deleted on a schedule yet.

### 2.1 Accounts and sign-in

| Data store | Personal data | Purpose | Who can read it | Current retention |
|---|---|---|---|---|
| Supabase Auth (managed by the provider) | Email, bcrypt password hash, sign-in sessions, confirmation and reset tokens | Sign-in and account security | The provider, and the auth boundary (`src/lib/auth.ts`) | Provider-managed. Deletion requests are handled by hand. |
| `public.users` | Email (copy), app user ID, role, suspension and messaging-restriction flags, auth user ID | The app's own account record | The account holder (own row). Admins through admin tools. | No deletion path |
| `public.notification_preferences` | Three email switches | Respect what people asked for | The account holder | With the account |
| `public.notifications` | Title, body, link, and a data payload (for example, the other party's name) | In-app and email notices | The recipient only | Not cleared on a schedule. Planned: read notices cleared after a few months. |

### 2.2 Businesses

| `public.business_profiles` | Business name, contact name, state, city | Run the business profile and campaigns | Visible to the business and to people on its hires and applications, as the views allow | With the account |

### 2.3 Creators and the directory

| Data store | Personal data | Purpose | Who can read it | Current retention |
|---|---|---|---|---|
| `public.influencer_profiles` | Display name, state, city, bio, niches, starting rate (businesses and admins only), publish and indexing flags, media key (a random folder name, not the user ID), hidden flags | Public profile and directory | Signed-out: name, photo, cover, state and city, niches, bio, indexing flag, completed-job count, join date. Businesses and admins also see starting rate and handles. | With the account |
| `public.influencer_platforms` | Platform, handle, self-reported follower range | Show where a creator posts | Platform names and ranges to the public. Handles to businesses and admins only. | With the account |
| `public.verification_requests` | Handle, platform, one-time code, follower count an admin recorded, review details | Verify that a handle belongs to the creator | Creator (own rows), admins | No deletion path |
| `public.portfolio_samples` and the `profile-photos` public bucket | Images, captions, post link, platform | Work samples and profile images. Public bucket: file addresses are public, so the folder name must stay random. | Samples publicly, post link to businesses and admins | With the account. Hidden samples are kept. |
| `public.profile_reports` | Reason, details, reporter ID | Safety review | Admins. `[Confirm whether the reported person is told who reported.]` | No deletion path |

### 2.4 Campaigns, applications and chat

| Data store | Personal data | Purpose | Who can read it | Current retention |
|---|---|---|---|---|
| `public.campaigns`, `campaign_platforms`, `campaign_deliverables`, `campaign_revisions` | Brief, guidelines, destination link, requirements. Personal data only if a business writes it into a brief. | Publish and run campaigns | Business and admins for drafts. Creators only once listed. | With the campaign |
| `public.campaign_reports` | Reason, details, reporter ID | Safety review | Admins | No deletion path |
| `public.applications` | Creator's note, proposed price or rate | Hiring decisions | The business that owns the campaign and the creator | With the campaign |
| `public.conversations`, `conversation_reads` | Thread participants, read times | Chat | The two people in the thread. Admins can see that a thread exists but not its messages. | With the account |
| `public.messages` | Message text, which can include personal data | Negotiation and agreement | **The two people in the thread only.** Admins have no read path to message text in the app. | No deletion path |
| `public.user_blocks` | Who blocked whom | Stop contact between two people | The two people | No deletion path |

### 2.5 Work, proof and disputes

| Data store | Personal data | Purpose | Who can read it | Current retention |
|---|---|---|---|---|
| `public.submissions` | Links, the creator's note, review dates, denial reasons | Review of work | The business and the creator on the hire. Admins for disputes. | With the hire |
| `public.proof_files` and the private `work-proof` bucket | Screenshots, which may show other people or private information | Evidence of work | Signed links that last 10 minutes, to the people on the hire and admins | Files not attached within a day are deleted by the daily job. Attached files have no deletion path. |
| `public.disputes`, `dispute_statements` | Reasons, statements, links | Settle disagreements | The two people on the hire and admins | With the hire. No deletion path. |
| `public.click_proofs` | Links and note recorded by the creator | Proof for pay-per-click hires | The two people on the hire and admins | No deletion path |

### 2.6 Money

| Data store | Personal data | Purpose | Who can read it | Current retention |
|---|---|---|---|---|
| `public.payments` | Payment reference, totals, fee notice time, wallet and card parts | Take and record payments | The paying business, admins | Financial record. Retain for `[period]`. |
| `public.payment_events` | Event key and a trimmed copy of the payment provider's answer (reference, amount, fees, currency, status, channel, paid time, provider ID). No customer details are kept. | Stop duplicate events, audit | Server only. No API role can read it. | Financial record. Retain for `[period]`. |
| `public.ledger_entries` | Amounts, account names, linked hire, payout and payment IDs, provider reference | The ledger. Never edited or deleted. | The owner of each wallet row, and admins | Financial record. Retain for `[period]`. |
| `public.bank_accounts` | Bank name, bank code, last four digits, account name, provider recipient code | Pay creators | The creator (own row) and admins through payout pages. The full number is never stored on `main`. | With the account, or as the financial record requires |
| `public.payouts` | Amount, fee, destination snapshot (bank name, last four digits, account name, recipient code), approver, decision reason | Payout approval and audit | The creator and admins | Financial record |
| `public.reconciliation_runs` | Totals only, no personal data | Daily check against the payment provider | Admins | Financial record |

### 2.7 Tracked links and click records

| Data store | Personal data | Purpose | Who can read it | Current retention |
|---|---|---|---|---|
| `public.tracked_links` | Campaign and hire references, click totals | Count billable clicks | The two people on the hire and admins | With the hire |
| `public.link_clicks` | Visitor hash (HMAC-SHA256 of IP and user agent, keyed with a secret), user-agent hash, referrer domain, channel label, filter reason, billable flag | Count and explain clicks | **The two people on the hire can read these rows directly** through the API, as well as admins. See gap G4. | No deletion path |

### 2.8 Safety

| Data store | Personal data | Purpose | Who can read it | Current retention |
|---|---|---|---|---|
| `public.moderation_events` | Strike or action, the flag found, **the text of a held-back message (up to 2,000 characters)**, reasons, actor, dedupe key | Strikes and admin decisions. Append-only by trigger. | Admins | No deletion path. See gap G2. |
| `public.moderation_appeals` | Appeal text and the answer | Appeals | The person who appealed and admins | No deletion path |

### 2.9 Operations

| Data store | Personal data | Purpose | Who can read it | Current retention |
|---|---|---|---|---|
| `public.rate_limit_hits` | A key made of a limiter name and either a user ID or a raw IP address (sign-up, sign-in and password-reset limits, and the creator report limit use the IP) | Limit repeated attempts | Server only (the database role for rate limits) | Pruned only when the same key is hit again after its window. Keys that stop being used are never removed. See gap G1. |
| `public.waitlist` | Email, role, source | Pre-launch list. Nothing writes to it since 2026-11-10. | Admins | `[Delete or confirm retention before launch.]` |
| Server error reports (PostHog) | Error name, message and stack, with email addresses and long numbers removed. Fixed non-personal ID. | Find faults | The team with access to PostHog | `[Set in PostHog.]` |
| Hosting and database logs (Vercel, Supabase) | IP addresses, request paths, status codes | Operate and secure the service | Team with access to each provider | `[Set in each provider.]` |

## 3. Processors and sub-processors

| Processor | Personal data sent | Purpose | Location | Contract and assessment status |
|---|---|---|---|---|
| Supabase | All stored data, including sign-in data and files | Database, sign-in, file storage, live updates | `[Frankfurt: confirm]` | `[DPA signed? Transfer assessment?]` |
| Vercel | Request data, IP addresses, server logs | Hosting, serverless functions, scheduled jobs | `[Functions in Frankfurt; global edge]` | `[Confirm]` |
| Paystack | The paying business's email address (to start checkout; card details are entered on Paystack's hosted page, never on ours), amounts and references; creator's full account number and name (once, for the account check and transfer recipient); transfer details; provider event data | Card payments, account name checks, transfers, balance | `[Confirm]` | `[Confirm, including whether Paystack's own terms permit holding funds for third parties; see the AML policy.]` |
| Resend | Email addresses, names in email content, email bodies. Also the auth emails sent through Supabase SMTP. | Transactional email | `[Confirm]` | `[Confirm]` |
| PostHog | Error text with emails and long numbers removed | Error reporting | `[US or EU cloud, chosen at project creation: confirm]` | `[Confirm]` |

Not a processor for personal data: Google Fonts, which is downloaded at build time only. Visitors' browsers don't contact it.

**Planned, not live:** Dojah (identity checks) and Cray (payments and virtual accounts). Both are on unmerged branches (`identity-verification` and `cray-payments`). Each needs its own processor entry, transfer assessment and DPIA before merge. See gap G9.

## 4. Access control

### 4.1 Who can do what

- **Business, creator and admin are separate roles.** A person has one role. Admins are created by hand in the database, never through sign-up.
- **Row-level security** is on every table. Anonymous and signed-in API roles are granted only the reads and writes the app needs, and money tables take no direct writes from any API role.
- **Server-only database access** uses the service role, which is used only in `src/lib/supabase/admin.ts`. The secret key must never reach the browser.
- **Every server action and route** must: check sign-in, check role and ownership, validate input, then act.

### 4.2 Admin access to personal data

- Admin screens are under `(admin)` and are checked on the server as well as in the database (`require_admin()` and the role checks inside security-definer functions).
- Admins can read: accounts and profiles, verification records, reports, campaign review, disputes and statements, payouts and bank destinations (name and last four digits), the ledger, reconciliation runs and the trail for each hire.
- **Admins cannot read chat message text in the app.** Message rows are visible only to the two people in the thread. If a future admin tool needs message text, this policy and the privacy notice must change first.
- Admin actions that change state record an actor and a reason where the database requires one. Reads are not logged. See gap G6.

### 4.3 Payout review (admin)

This is the control that releases money to creators. It is covered in more depth in the [AML/CFT and fraud policy](3-internal-aml-cft-fraud-policy.md), section 6.

- A creator requests a payout. The request is checked against the minimum (₦1,000), the balance and the transfer cost, under a row lock on the creator's account. The request is limited to 5 per 10 minutes.
- An admin approves or rejects it on `/admin/money/payouts`. Approval moves it to `processing` and sets the Paystack reference. Rejection needs a written reason and returns the money to the creator's wallet.
- The payout keeps the bank destination it had when it was requested. Changing the bank account later does not redirect a pending payout.
- **Current state:** one admin approves each payout. There is no second approver, no amount threshold, and no check on recent bank-account changes. See gaps G7 and G8.

### 4.4 Access reviews and training

- Admin accounts are reviewed `[quarterly]`. Removal of an admin is done by hand in the database and recorded in the policy log. `[Not yet done; see G6.]`
- Everyone with admin or engineering access completes training on this policy and the breach workflow `[before access is granted, then yearly]`.

## 5. Security controls in place (on `main`)

- Payment and transfer webhooks check a signature (HMAC SHA-512 over the raw body) before reading anything. Payment and transfer results are verified with the provider before any change is made. Events are stored by key, so repeats are ignored.
- Secrets live in environment variables. Their names appear in `.env.example`, never their values. Client-side keys are limited to publishable keys.
- Private buckets for work proof, with 10-minute signed links. Public bucket for profile images, with random folder names.
- Chat, applications, campaign briefs, bios and portfolio captions are checked for contact details before they are saved.
- Rate limits on sign-up, sign-in, password reset, messages, applications, bank checks, payouts, submissions, disputes and statements.
- Server error reports drop email addresses and long numbers. No session recording, no user profiles, no autocapture.
- Bank account numbers are never stored in full. Only the last four digits and the provider's recipient code are kept.

## 6. Data subject requests

**Intake.** Requests come to `hello@pitchype.com` `[confirm]` and are logged in a request register `[location]`. The register records the date received, the person, the right requested, the steps taken, the answer and the date.

**Verification.** Confirm the requester by replying to the email on file, or by a signed-in request from the account. Do not act on a request from an address that doesn't match an account, without a second check.

**Handling.**
- **Access and export:** the data-protection lead runs the approved query set (to be written) and sends the result securely. There is no self-service export yet (gap G5).
- **Correction:** update the field, then record the change in the register.
- **Deletion:** delete or anonymise the personal fields that can go. Keep ledger rows, payment and payout records, and safety records, which are append-only or required by financial law. Tell the person what was kept and why.
- **Objection or restriction:** assess against the lawful basis in the privacy notice. Restrict where the basis fails.

`[Counsel: confirm the response deadline under the NDPA and whether any fee applies.]`

## 7. Retention schedule (proposed)

`[All periods are proposals for counsel to set. The "current" column is what the system does today.]`

| Category | Proposed period | Trigger | Current |
|---|---|---|---|
| Account and profile data | Until closure, then `[30 to 90]` days | Account closed | Kept. No deletion path. |
| Chat messages | `[Period]` after closure | Account closed or thread closed | Kept. No deletion path. |
| Ledger, payments, payouts, bank records, reconciliation | `[At least 6 years]` | Transaction date | Kept. Append-only. |
| Safety records (strikes, reports, appeals, moderation events) | `[Period]` after closure, to stop removed accounts returning | Account closed | Kept. Append-only. |
| Message text held back for contact details | `[Shorter period proposed]` | Date of the held message | Kept in `moderation_events.detail`. See G2. |
| Rate-limit keys with IP addresses | `[Hours to days]` | Window expiry | Kept indefinitely for keys not hit again. See G1. |
| Link-click records | `[Period]` after the hire settles | Settlement | Kept. |
| Work proof (attached) | `[Period]` after the hire settles | Settlement | Kept. |
| Work proof (never attached) | 1 day | Upload | Deleted by the daily job |
| Notifications | `[A few months]` once read | Read date | Kept |
| Waitlist | Until launch notice, or on request | Launch or request | Kept |

## 8. International transfers

Personal data is held and processed by providers outside Nigeria as set out in section 3. For each one, `[counsel]` must confirm the lawful transfer mechanism under the NDPA and document the transfer assessment. Until then, the transfers are recorded as open items in section 10.

## 9. Impact assessments

A Data Protection Impact Assessment (DPIA) is required before any of the following ships, `[counsel to confirm the trigger list]`:

- Identity verification with NIN, BVN or a live selfie (the planned Dojah work). Biometric data is treated as sensitive personal data in this policy `[counsel to confirm]`, and screening against sanctions and PEP lists is a further processing purpose.
- Any new automated decision that changes someone's account, such as a suspension or a payout hold.
- Any change that lets an admin, or a business or creator, read chat message text.
- The planned card and bank-transfer changes that would keep full account numbers encrypted.

## 10. Gap register

Each gap is a point where the code does not meet this policy, or where a decision is still open. The team owns the fix. A gap that is still open must be disclosed in the privacy notice or fixed before launch.

| ID | Gap | Evidence in code | Risk | Proposed fix | Owner / date |
|---|---|---|---|---|---|
| G1 | **Raw IP addresses kept in the database.** The rate-limit key for sign-up, sign-in, password reset and creator reports includes the IP address. Old keys are never removed. | `src/app/(auth)/*/actions.ts`, `src/app/(marketing)/creators/[slug]/actions.ts` call `clientIp()` into `createRateLimiter`; `consume_rate_limit()` in `20261118100200_rate_limits.sql` deletes only the same key's old hits | High: personal data kept with no purpose or period. The privacy draft (v1) said IP addresses were not saved; that is not true. | Hash the IP with a keyed HMAC before it leaves the request, and prune keys after their window through a scheduled job | `[ ]` |
| G2 | **Held-back message text kept in the safety log.** Up to 2,000 characters, which can include a phone number or email. Append-only. | `send_message()` in `20261110100200_create_chat.sql` passes the cleaned text to `record_strike()`, which stores it in `moderation_events.detail`. A purge hatch exists in `20261110100000_create_moderation.sql`, but nothing calls it. | High: data minimisation, and it cannot be removed | Store a short excerpt or a hash of the matched pattern, not the full text. Decide with counsel whether existing rows are kept for the strike record. | `[ ]` |
| G3 | **Draft v1 of the privacy notice said admins may read messages.** The code does not allow it. | `listMessages()` in `src/lib/db/chat.ts` reads through the session client; RLS on `messages` allows only the two people in the thread | Medium: a misleading statement to the public | Corrected in the new public notice draft. Keep it that way unless the admin read path is built and disclosed first. | Done in draft |
| G4 | **Hire parties can read raw click rows.** Visitor hashes, user-agent hashes and referrer domains are readable through the API by the business and the creator on the hire. | `link_clicks` select policy in `20261119100100_tracked_links.sql`; `authenticated` has `select` on the table | Medium: pseudonymous data read by a party that doesn't need it. The UI uses aggregate functions instead. | Revoke `select` on the table for `authenticated`, and serve only the aggregate functions (`link_summary`, `campaign_click_summary`) | `[ ]` |
| G5 | **No self-service export or deletion.** Requests are handled by hand, and there is no written query set. | No export or deletion route under `src/app` | Medium: NDPA rights cannot be met quickly | Write the query set and the deletion steps (section 6), then decide whether to build a request form | `[ ]` |
| G6 | **No logging of admin reads, and no access review.** | No read audit in the admin pages | Medium: no evidence of who saw what | Log admin reads of personal data in a table that is append-only; schedule an access review | `[ ]` |
| G7 | **Single admin approval of payouts.** No second approver and no amount threshold. | `approve_payout()` in `20261113100300_create_payouts.sql` checks the admin role only | High for money: one admin can release any amount | Second approval above a threshold `[amount to decide]`. See the AML policy. | `[ ]` |
| G8 | **No check on recent bank-account changes before a payout.** | `save_bank_account` overwrites the one account per creator; `request_payout` does not compare dates | High for money (account takeover) | Hold a payout requested within `[24]` hours of a bank change, and show the hold to admins | `[ ]` |
| G9 | **Planned work is not in this policy's processor list.** Dojah (identity) and Cray (payments, virtual accounts) exist only on unmerged branches. | `identity-verification` and `cray-payments` branches; their design specs | High when merged: NIN, BVN, selfies, and full account numbers encrypted | Assess each provider before merge, update sections 2 to 3 and 9, and update the privacy notice | `[ ]` |
| G10 | **Stale code comment.** `src/lib/money-limits.ts` says the limiters are in memory. They are counted in the database. | Comment in `money-limits.ts` vs `rate-limit.ts` | Low: misleading to engineers | Correct the comment | `[ ]` |
| G11 | **No retention job.** Nothing deletes or anonymises personal data on a schedule, except the orphan proof-file job and the rate-limit pruning described in G1. | Scheduled jobs in `vercel.json` | High: the retention schedule in section 7 is not met | Build the jobs once the periods are approved | `[ ]` |
| G12 | **No DPO, ROPA sign-off, DPA register or DPIA** on file. | This document and the AML draft's gap register | High for the NDPA | Counsel to advise; owner to complete | `[ ]` |

## 11. Breach response (72-hour workflow)

The NDPA requires a controller to notify the NDPC **within 72 hours of becoming aware of a personal data breach** that is likely to risk people's rights and freedoms, and to tell affected people without undue delay where the risk is high. `[Counsel: confirm the section reference and wording.]` The 72 hours run from awareness, not from when the investigation ends. Treat the first reasonable suspicion as the start.

### 11.1 Roles

- **Incident lead:** the data protection lead (or the founder if they can't be reached). Owns the clock and the decisions.
- **Technical lead:** the engineer who knows the system best. Contains the issue and gathers evidence.
- **Counsel:** advises on notification and wording.
- **Communications:** drafts messages to people, approved by the incident lead.
- **Provider contacts:** Supabase, Vercel, Paystack, Resend, PostHog. Keep their security contacts on file `[location]`.

### 11.2 Timeline

| When | Step | Owner |
|---|---|---|
| T0 | Anyone who suspects a breach reports it to the data protection lead, by the fastest route, even if unsure. Record the time of report. This starts the clock if anyone has reasonable grounds to believe data has been exposed. | Reporter |
| T0 + 1 hour | Open an incident record: time of awareness, what was seen, the source, who knows. Assign the roles above. | Incident lead |
| T0 + 4 hours | **Contain.** Revoke or rotate exposed keys (the service key, webhook secrets, the click-hash secret, the cron secret) `[keep names only in the record]`. Disable the affected route or job. Restrict admin access if an admin account is involved. **Do not delete logs or rows.** Preserve evidence first. | Technical lead |
| T0 + 12 hours | **Assess.** What data, which people, how many, how sensitive (for example, bank or identity data is high risk), whether it is still exposed, and whether it could lead to harm. Record the answers in the register. | Incident lead with technical lead |
| T0 + 24 hours | **Decide notifiability.** A breach that is not notified must still be recorded, with the reason. Ask counsel if unsure. | Incident lead and counsel |
| By T0 + 48 hours | **Prepare the NDPC notice** (what happened, what data, how many people, likely consequences, what we did, contact details). Prepare the message to affected people if the risk is high. | Incident lead, counsel |
| **By T0 + 72 hours** | **Notify the NDPC** `[channel and form to confirm]`, even if the picture is incomplete. Send later details in a follow-up. If it is late, record the reason. | Incident lead |
| As soon as possible | Tell affected people where the risk is high, in plain words: what happened, what data, what we have done, what they can do, and how to reach us. | Communications, approved by counsel |
| Within 7 days | Post-incident review: cause, what should change, which gap in this policy it exposed. Update the policy and the gap register. | Incident lead |

### 11.3 Processors

Each processor must tell us about a breach that affects our data without undue delay, so that we can meet the 72 hours. `[Confirm the contract terms and timings. Put the time limit in each DPA.]` If a processor reports to us late, record it in the incident and in the processor register.

### 11.4 Breach register

Keep every incident, whether or not it was notified. Fields: date and time of awareness, description, data, people affected, assessment, notification decision and reasons, dates of notice, containment, follow-up.

## 12. Training, review and approval

- Relevant staff get training on this policy and on section 11 `[before access is granted, then yearly]`.
- The data protection lead reviews the gap register `[monthly]` until every gap is closed or disclosed.
- The policy is reviewed at least yearly, and when a provider, a data store, a payment flow or the privacy notice changes.

**Approved by:** ________________________ **Role:** ________________________
**Signature:** ________________________ **Date:** ____________
