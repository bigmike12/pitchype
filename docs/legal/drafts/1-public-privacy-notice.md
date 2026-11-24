# Pitchype Privacy Notice

**DRAFT for legal review. Not in force.** Drafted 2026-11-24 from how the code on `main` collects and uses data. `[Square brackets]` mark open points for counsel or the team. This draft replaces the 2026-11-17 draft in [privacy.md](../privacy.md) once approved.

## 1. Who we are

Pitchype is a marketplace that connects businesses with micro and nano creators in Nigeria. We decide how and why your personal data is used on pitchype.com and in the Pitchype app.

- Legal entity: `[registered name, RC number and registered address]`
- Contact for privacy questions: `hello@pitchype.com` `[confirm inbox]`
- Data protection officer: `[name and contact, if one must be appointed under the Nigeria Data Protection Act 2023 (NDPA)]`

## 2. What this notice covers

It covers everything you do on pitchype.com, in the signed-in app, and in the emails we send you. It also covers the payment and payout steps, which are handled by our payment provider (section 5).

## 3. What we collect

### 3.1 What you give us

| What | Who gives it | Why |
|---|---|---|
| Email address and password | Everyone | Create and secure your account. Your password is handled by our sign-in provider. We can't read it. |
| Account type (business or creator) | Everyone | Decides which tools you see. An account is one type only. |
| Business name, contact name, state and city | Businesses | Run your business profile and campaigns |
| Campaign details: title, brief, guidelines, deliverables, platforms, niches, locations, follower requirements, price, dates, and an optional destination link | Businesses | Publish the campaign to creators |
| Display name, state and city, bio, niches, optional starting rate | Creators | Build your public profile and directory listing |
| Platform handles and follower ranges | Creators | Show where you post. Follower counts are self-reported ranges until verified. |
| Verification code and the follower count an admin records | Creators who verify | Confirm that a handle belongs to you |
| Profile photo, cover image, portfolio samples (image, caption, platform and, for businesses, the post link) | Creators | Show your work in the directory |
| Applications and any price or note you propose | Creators | Apply to campaigns |
| Chat messages | Both | Negotiate and agree work |
| Work you submit: links, up to 5 screenshots and a note | Creators | Show the business the work was done |
| Disputes and the statements you write in them | Both | Settle a disagreement about a hire |
| Bank name, bank code, account name, and the last four digits of the account number | Creators who request payouts | Pay you. The full account number is sent to our payment provider to check the name and set up the transfer. We do not keep the full number. |
| Reports and appeals, and what you write in them | Anyone who reports or appeals | Keep the platform safe |

### 3.2 What we create

- **Payment and money records.** Payments you make or receive, fees, wallet movements, payouts, and the payment provider's reference for each. These form our ledger. We never edit or delete ledger entries; we correct mistakes by adding a reversing entry.
- **Tracked-link records.** When a visitor clicks a creator's tracked link for a campaign, we record whether the visit counts, the site it came from (a domain), and a channel label such as Instagram, TikTok or WhatsApp, or "other site" or "unknown". We record a keyed hash of the visitor's IP address and browser, not the IP address itself. The business and creator on that hire can see these counts. `[Engineering to confirm which fields the two parties can read directly; see the internal data protection policy.]`
- **Notifications** we send you inside the app.
- **Safety records.** Strikes, blocks, suspensions, admin decisions and the written reasons for them. When a message is held back because it contains contact details, the text of that message is kept in our safety log so an admin can review the strike. `[Counsel: confirm this disclosure and retention.]`
- **Technical data.** To limit repeated attempts (sign-ups, sign-ins, password resets, messages, bank checks and payout requests), we record a count against a key that includes your user ID or, before you sign in, your IP address. `[Engineering and counsel: IP-address retention must be fixed or disclosed as it is kept before this notice is published. See internal policy.]` Our hosting provider also keeps ordinary server logs, which include IP addresses.

### 3.3 Cookies

We use only the cookies needed to keep you signed in. We don't use advertising or analytics cookies. `[Re-check before launch.]`

### 3.4 Coming soon (not live yet)

Identity verification for creators and business owners, which will ask for a National Identification Number (NIN) or Bank Verification Number (BVN) and a live selfie, is planned but **not live**. This section must be updated, and the affected processing assessed, before that feature is released.

## 4. Who can see what

- **Signed-out visitors** can see a creator's display name, photo, cover, city and state, bio, niches, the names of their platforms and follower ranges, the number of paid jobs they have completed, the month they joined, and their published portfolio samples (image and caption). Creators can opt out of search-engine indexing. Profiles are visible only after the creator publishes them. Admins can hide a profile.
- **Signed-in creators** see the same as signed-out visitors.
- **Signed-in businesses** also see each creator's platform handles and starting rate. Post links on portfolio samples are shown to businesses only.
- **The two people on a hire** see each other's name, the terms, the submissions, the dispute statements, the payment status, and the click counts for that hire.
- **Chat messages** are visible only to the two people in the conversation. `[Do not change this without updating this notice.]`
- **Campaigns** are visible only to signed-in creators, admins, and the business that posted them.
- **Admins** see what they need to review reports, verifications, payouts, disputes and safety cases.

We don't sell your data and we don't use it for advertising.

## 5. Who processes your data

We use these providers to run Pitchype. Each processes data for us under its own terms and may keep its own records where financial or legal rules require.

| Provider | What it does for us | Where data is held |
|---|---|---|
| Supabase | Database, sign-in, file storage and live updates | `[Frankfurt, Germany: confirm]` |
| Vercel | Hosts the website and app | `[confirm functions region and edge locations]` |
| Paystack | Card payments through its hosted checkout, bank-account name checks, and bank transfers to creators | `[confirm]` |
| Resend | Sends our emails, including sign-up and password emails | `[confirm region]` |
| PostHog | Records server errors only. Personal details such as email addresses and long numbers are removed first. No session recordings and no user profiles. | `[US or EU cloud: confirm the region chosen]` |

We may share data with regulators, the police or courts when the law requires it, and with our professional advisers. `[Counsel: transfers outside Nigeria, processor contracts and any notice needed.]`

## 6. Why we use it and our legal basis

`[Counsel to confirm the lawful basis for each use under the NDPA 2023.]`

| Use | Proposed basis |
|---|---|
| Run your account, profile, campaigns, applications and chat | Contract |
| Take payments, hold money for hires, pay creators, keep the ledger, reconcile with our payment provider | Contract, and legal obligation for records and tax |
| Check chat messages for contact details, apply strikes and suspensions, and prevent fraud and abuse | Legitimate interests (protecting people and the platform), and contract |
| Limit repeated attempts to sign in, sign up or request payouts | Legitimate interests (security) |
| Verify handles and review reports and appeals | Legitimate interests |
| Send emails about your account, payments and safety | Contract |
| Meet legal duties and answer lawful requests | Legal obligation |

**Automatic checks.** Chat messages are checked automatically for contact details such as phone numbers, email addresses, and links to other apps. A message that matches is not delivered and counts as a strike. A first strike is a warning. A second pauses new messages, applications and hires for three days. A third suspends the account until an admin reviews it. You can ask for a review of a strike, once a day, from your account page. Suspension does not take away money you are owed: running work, escrow and payouts carry on.

## 7. How long we keep it

`[All periods below are proposals. Counsel to set them.]`

| Data | Proposed period |
|---|---|
| Account and profile | Until you close your account, then deleted or anonymised within `[30 to 90]` days, except where the rows below apply |
| Chat messages | `[While the account is open, plus a set period]` |
| Ledger, payments, payouts and tax records | `[At least 6 years]`. We can't edit or delete ledger entries, so on closing an account we remove names where possible and keep the money records. |
| Strikes, reports, appeals and admin decisions | `[Period]` after the account closes, to stop removed accounts coming back |
| Held-back message text in the safety log | `[Period]` `[Counsel to decide, and whether it should be removed sooner]` |
| Rate-limit counts that include an IP address | `[Period]` `[To be set and built before this notice is published]` |
| Notifications | Read ones are cleared after `[a few months]` |
| Waitlist emails (before launch) | Until we tell you we have opened, or you ask us to remove them |

**Account deletion is not yet built.** Until it is, you can ask us to delete your account by email (section 9).

## 8. Your rights

Under the NDPA 2023 you can ask us to:

- **see** the personal data we hold about you;
- **correct** data that is wrong;
- **delete** your data where we no longer need it;
- **export** your data in a usable format;
- **object to** or **restrict** some uses; and
- **withdraw consent** where we rely on it.

We may need to confirm that a request really comes from you. Some money and safety records must be kept and can't be erased (section 7). If you are unhappy with how we handle a request, you can complain to the Nigeria Data Protection Commission `[confirm the complaint route and response time]`.

## 9. How to contact us

Email `hello@pitchype.com` `[confirm]` with the subject "Privacy request". Tell us which right you are using and enough detail to find your account.

## 10. Security

Access to data is limited by account type and by database rules, so people can see only their own records and what the product shows them. Admin tools are restricted to staff. Bank details are kept to the last four digits. Our database's secret key is used only on our servers and never reaches the browser. No system is perfectly secure. If you think there is a problem, email us at the address in section 9.

If a personal data breach is likely to put your rights and freedoms at risk, we will tell the Nigeria Data Protection Commission within 72 hours of becoming aware of it, and tell affected people without undue delay where the risk is high. `[Counsel: confirm the NDPA breach provisions and wording.]`

## 11. Children

Pitchype is for people `[18]` and over. We don't knowingly collect data from children. If you think we have, email us and we will delete it.

## 12. Changes

We will update this notice when we change how we use data, and tell you about changes that matter. The date at the top shows the latest version.

*Last updated: `[date of publication]`*
