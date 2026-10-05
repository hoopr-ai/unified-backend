# Smash 7-day trial — backend

Step 1 (base) is the trial itself: eligibility gate, credits, expiry, upgrade
wall, admin extension. Step 2 (journey) is the conversion journey on top of it:
3 emails + 3 pushes, in-app nudges, sales alerts, Day-7 measurement. Mixpanel
stays with the FE; the backend keeps only what the journey decides on.

## Deploy

1. Run `scripts/create-smash-trial-tables.sql` once (idempotent).
2. Set `SMASH_TRIAL_LAUNCHED_AT` to the go-live moment (ISO, e.g.
   `2026-10-06T10:00:00+05:30`) and never move it. Only accounts created at/after
   it can get a trial, so existing users never do. Unset or invalid → no trial
   starts (logged at boot).
3. Set `SMASH_TRIAL_ENABLED=true` when the FE is ready. While it is off, signup
   is ungated and no trial starts. Existing trial rows keep working either way.
4. Add the `smash-trials` grant to internal-fe `src/services/functionalities.ts`.

## Rules

| Rule | Where |
| --- | --- |
| 3 credits, one shared pool, usable only on the token types picked at onboarding (all four if none) (`TRIAL_CREDITS`) | `brand_trials`, one row per **brand**; `getTrialOwnerTypes` |
| Clock starts at complete-profile, when the self-signup creates its brand | `startTrialForBrand` |
| Invited teammates share the brand's trial | brand-scoped |
| Blocked at day 7 **or** 0 credits, whichever comes first | `resolveTrialState` |
| Unused credits are forfeited at day 7 (`TRIAL_GRACE_HOURS = 0`) | constant; change it there |
| +2 extension: once per brand, credits only, never changes `TRIAL_CREDITS` | `POST /admin/smash-trials/:brandId/extend` |
| Paid tokens always win; a brand with **any** `token_assigned` row is `PAID` | `chargeTrialCredit` |
| YRF / Zee (restricted labels) are not licensable on the trial | licensing |
| One trial per email domain, enforced by `UNIQUE(emailDomain)` | DB |
| **Who gets a trial:** a NEW (created at/after `SMASH_TRIAL_LAUNCHED_AT`) ENTERPRISE self-signup on a work domain with no other account on that domain | `isTrialEligibleSignup` |
| **Existing users never get one** — not even when they finish an old, half-done profile now; nor do admin-created or invited users start one | `isTrialEligibleSignup` |
| **gmail.com & other personal domains** (`PERSONAL_EMAIL_DOMAINS`) sign up and log in normally but never get a trial, never see one (even inside a trial brand: `trial: null`, no nudges, no trial credits) and get no journey mail | `isTrialEmail`, `findBrandTrial` |

## Signup gate — `POST /user/send-email-otp`

This only applies to brand-new ENTERPRISE users. Existing and invited users pass.
Personal addresses (gmail/yahoo/outlook/…) also pass — they get a normal
account with no trial. The only rejection is `403` with `error.errorCode`:

- `domain_exists`: an ENTERPRISE user or trial already has the (work) domain. Route to sales.

(`personal_email` is no longer returned.)

Known gap: a fresh company-like domain each time gets through. There is no phone
or device debounce.

## Complete profile — `POST /user/complete-profile`

New optional fields (stored on `user_profiles`):

```json
{ "categoryPreferences": ["indie_regional", "hoopr_og", "intl_songs"],
  "discoveryChannel": "sales_led | sage_upsell | sage_paid_report | landing_plg" }
```

## Trial state

`GET /user/profile` returns `trial` and `onboarding`. `GET /user/trial` returns
`{ trial, nudges, inbox }` (see step 2). `trial` is `null` when the brand was
never on the trial.

```json
{ "planType": "TRIAL", "creditsTotal": 3, "creditsRemaining": 2,
  "trialStart": "…", "trialEnd": "…", "daysLeft": 5, "trialDay": 3,
  "isExtended": false, "licensingBlocked": false, "blockedReason": null }
```

`blockedReason` is `trial_expired` or `credits_exhausted`.

## Token balance — `GET /licenses/token-balance`

While the brand is on the trial (`planType: "TRIAL"`), `tokens` lists one
entry per token type the trial starter picked at onboarding
(`indie_regional` → `Regional & Indie`, `hoopr_og` → `Hoopr Originals`,
`intl_songs` → `International`; no picks → all four types). They are views of
the SAME pool of 3, so every entry carries the same balance and licensing on
any of them lowers all:

```json
[
  { "type": "Regional & Indie", "tokenBalance": 2, "totalAssignedToken": 3, "expiryDate": "<trialEnd>" },
  { "type": "International",    "tokenBalance": 2, "totalAssignedToken": 3, "expiryDate": "<trialEnd>" }
]
```

Don't sum them for a total — use `trial.creditsRemaining`. `tokenBalance` is 0
once the trial is blocked (expired or exhausted). The entries are gone once the
brand is PAID, and never shown to personal-email users.

Licensing a track whose owner type was not picked (Chartbusters is never
pickable) does not use the trial: it returns the usual `400` "not enough
credits" error.

## Licensing — upgrade wall

When the trial is blocked, licensing returns `403` with `error.errorCode` =
`trial_expired` or `credits_exhausted`. A successful trial license returns the
updated meter as `trial` in the response, and the license row has `type = 'trial'`.

## Admin — `smash-trials` grant, INTERNAL platform

- `GET /admin/smash-trials?page=&limit=&search=`: `search` matches the email domain.
- `POST /admin/smash-trials/:brandId/extend`: returns `409` if already extended.


---

# Step 2 — conversion journey

## Deploy

1. Re-run `scripts/create-smash-trial-tables.sql` (still idempotent): adds
   `brand_trials.activatedAt / day7Segment / day7EvaluatedAt`,
   `trial_journey_sends` and `trial_signals`.
2. Env:

| Var | What |
| --- | --- |
| `SMASH_TRIAL_JOURNEY_ENABLED=true` | Master switch for every outbound journey send. Off: nothing is sent; Day-7 segments are still recorded. |
| `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` | Push. Unset → push slots are recorded as `skipped` and only show in the in-app inbox. |
| `SALES_ALERT_EMAILS` | Comma list for sales-assist alerts. Unset → alerts are logged and recorded as `skipped`. |
| `API_BASE_URL` | This API's public origin, for the unsubscribe link (default `https://api-smash.hoopr.ai`). |
| `FRONTEND_URL` | Already used; links and magic links point here. |
| `SES_SENDER_MAIL`, `SES_CONFIGURATION_SET` | Already used by campaigns; journey emails go through SES. |

3. SES: turn on **open and click tracking** on the configuration set and add
   `Open` / `Click` to its SNS event destination (`POST /webhooks/ses`).
   Without it Email 1's "not opened" escalation never fires, everything else works.
4. The scheduler registers `trial-journey` (every 10 min) on boot.

## The budget — `trial_journey_sends`

One row per (subject, slot), inserted **before** sending (`UNIQUE(subjectKey, slot)`),
so a slot can never go twice — not even when the tick and the
credit-exhaustion trigger race. At-most-once: a crash mid-send leaves the row
`pending` and the slot is not retried.

| Slot | When (after `startedAt`) | Who | Content |
| --- | --- | --- | --- |
| `welcome` | at trial start | trial starter | Transactional, uncounted: "3/3 credits available" |
| `email_1` | D1–D4 | everyone | Activated: tips + seeding recommendations + chosen categories. Not activated: + magic link + credits reminder |
| `push_1` | D2–D5 | activated, 0 credits used — or anyone whose Email 1 went unopened for 24h (no-click escalation) | first-track nudge |
| `email_2` | D4 → endsAt−2d | everyone | Standard: top 5 most downloaded tracks (30 days, restricted labels excluded) |
| `push_2` | D5–D6 | activated, credits left | Resume an abandoned Sound Tracking draft, else credits-remaining |
| `email_3` | endsAt−2d → endsAt | everyone | "Your trial expires on {date}"; not activated: + magic link |
| `push_3` | D6 → endsAt, **or immediately at 0 credits** | push-enabled | exhausted / converted (≥2) / needs assistance (1) / not converted (0) |

- Windows don't overlap per channel: if the scheduler was down, the slot due
  *now* goes and a missed earlier one is dropped — never two emails at once.
- Scheduled sends go out 10:00–20:00 IST only; the exhaustion push is exempt.
- A brand that gets any `token_assigned` row leaves the journey immediately.
- Emails skip suppressed addresses (bounce, complaint, unsubscribe).
- Push: permission denied (FE signal) or no subscribed device → the row is
  `skipped` / `undelivered`, and its copy still shows in the in-app inbox.

**Activated** (lane split) = first of: a trial credit spent, `smashAppTour`
finished, a new login more than 10 min after the trial started, or a
`GET /user/trial` poll more than 10 min after it started. With OTP signup every
trial user has logged in once, so "not logged in" in the journey doc means
"completed onboarding and left".

## FE contract

### `GET /user/trial` (changed)

Now returns `{ trial, nudges, inbox }`. `trial` is unchanged. `nudges` (never
counted against the budget):

| `key` | Show | `data` |
| --- | --- | --- |
| `tutorial` | First login; after <Skip>: next login → +1 day → +2 days (`final: true`) → gone (lapsed). Finishing = existing `POST /user/tour-seen {tour:"smashAppTour"}` | `{ skips, final }` |
| `usage_link_missing` | a trial license 24h+ old with no usage link | `{ licenseIds, trackCodes }` |
| `second_license_picks` | D3+, 1–2 credits used, credits left | `{ basedOnTrackCodes }` (feed into the existing recommendations) |
| `profile_instagram` | D2+, brand has no Instagram handle | — |
| `sound_tracking_resume` | a Sound Tracking draft untouched 24h+ | `{ projectId, name }` → `/sound-tracking/editor?projectId=…&source=resume` |
| `soft_upsell` | D6+, 2+ credits used, credits left | `{ creditsUsed, creditsTotal }` |
| `conversion_modal` | credits exhausted, or D6+ with 2+ used | `{ reason: "credits_exhausted" \| "day_7", creditsUsed }` |

`inbox`: every push-slot copy sent to the brand, newest first
(`{ sendId, slot, title, body, url, sentAt }`) — the in-app fallback for push.

### `POST /user/trial/signal` (new, ENTERPRISE session)

`{ kind, trackCode?, granted?, sendId? }` — send alongside the Mixpanel event:

| `kind` | When | Extra |
| --- | --- | --- |
| `enterprise_track_gated_viewed` | "Enterprise Only" track opened | `trackCode` (required). Sales alert on the 1st, escalation on the 2nd distinct track |
| `tutorial_skip_clicked` | <Skip> on the tutorial | — |
| `push_permission` | after the browser prompt resolves | `granted` (required) |
| `notification_opened` / `notification_clicked` | OneSignal click handler / inbox item click | `sendId` = `data.trialSendId` from the push payload, or the inbox item's `sendId` |
| `upgrade_cta_clicked` | any upgrade CTA | — |

### Push (OneSignal)

After login, `OneSignal.login(String(user.id))` — the backend targets users by
`external_id`. Push payloads carry `data.trialSendId`.

### `POST /user/magic-link/verify` (new, public)

`{ token }` → same cookies and body as `verify-email-otp`. The FE needs a
`/magic-login?token=…&redirect=…` page that posts the token, stores the session
like OTP login, then navigates to `redirect`. Single use, 72h; a used or
expired token is `401` → show the normal login.

### Signup rejection

Unchanged for the FE. `domain_exists` now also emails sales (once per address).

## Sales alerts (`SALES_ALERT_EMAILS`)

- Enterprise-only track opened by a trial brand (first time), and an
  escalation on the 2nd distinct gated track.
- Day-7 "needs assistance" (exactly 1 credit used).
- Signup blocked because the company domain already has an account.

## Other sends (outside the trial user's 3 + 3)

- **Team invite not accepted in 48h** → one email to the inviter per invitee.
- **Onboarding re-trigger** — self-signups that never finished complete-profile:
  emails at +1, +2, +3 days (the third says it's the last), each with a magic
  link; then they lapse. Only while `SMASH_TRIAL_ENABLED` is on, never for
  signups before `SMASH_TRIAL_LAUNCHED_AT`, never for personal-email addresses.
- **Unsubscribe**: every journey email links to
  `GET /trial-journey/unsubscribe?token=…`, which adds the address to the shared
  suppression list (`manual`, "unsubscribed via trial journey email").

## Day-7 measurement — internal-fe, `smash-trials` grant

- `GET /admin/smash-trials/funnel?from=&to=` — trials **started** in the range
  (default last 30 days): the 6 stages (signed up → logged in by D7 → licensed
  ≥1 → ≥2 (converted) → 3/3 → paid) with drop-off, conversion rate, Day-7
  segments, `exhaustedWithUsageLink` (the download-hoarding check) and the split
  by discovery channel. `stillRunning` counts trials whose 7 days aren't over.
- `GET /admin/smash-trials/:brandId/journey` — every send for the brand with
  status, open and click times.
- `POST /admin/smash-trials/journey/run` — queue a tick now.

Day-7 segment is written once per trial when its window closes:
`paid` / `converted` (≥2) / `needs_assistance` (1) / `not_converted` (0).

## Not built (needs a decision or another repo)

- FE work: the tutorial UI, banners and modals, the `/magic-login` page,
  OneSignal SDK init, the new Mixpanel events, the signal calls.
- Payment failure recovery (`upgrade_cta_clicked` with no purchase): the signal
  is recorded but nothing acts on it yet — needs a decision on who follows up.
- A "can't find a relevant track" concierge nudge (search with no license).
  Search is FE-side analytics; route it to `/contact-us` from the FE if wanted.
- No phone/device debounce for repeat trials (unchanged from step 1).
- A `List-Unsubscribe` header: SES `SendEmail` can't set one; it needs
  `SendRawEmail`. The in-body link works for compliance.
