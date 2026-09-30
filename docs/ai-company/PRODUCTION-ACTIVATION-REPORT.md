# Phase 42 — Production activation report

Branch `claude/inspiring-rubin-39bo23` · production baseline `c705fca` · audit before changes: `PHASE-42-ACTIVATION-AUDIT.md`.
Statuses used: READY · READY WITH CONFIGURATION · NOT CONNECTED · BLOCKED · NOT SUPPORTED · REQUIRES HUMAN ACTION · CERTIFICATION PENDING.

## The four states — kept separate

| State | Result | Why |
|---|---|---|
| **CODE READY** | **Yes** | Build, typecheck, Prisma validation and drift clean; 16 node suites green ×3; browser suites green ×2 except failures identical on `c705fca`; no NEW regression. |
| **PROVIDER CONNECTED** | **No — every provider NOT CONNECTED** | No provider credential exists in this environment (Anthropic, OpenAI, Gemini, Apollo, Hunter, NeverBounce, LinkedIn, Meta, X, Google, YouTube, ad accounts, GA4, GSC, SMTP/Gmail). |
| **LIVE-WORLD CERTIFIED** | **No — CERTIFICATION PENDING** | Nothing can be certified live without credentials. Every provider path is verified with deterministic stubs of the providers' real responses; the product never simulates results. The certification page runs the live checks once credentials exist. |
| **PRODUCTION ACTIVATION READY** | **No** | Needs the credentials and human actions below, live certification per provider, and a decision on the pre-existing public-site 404 defect (see Findings). |

## Scorecard

| # | Area | Status | Evidence / what is missing |
|---|---|---|---|
| 1 | AI | READY WITH CONFIGURATION | Central runtime only (`runAgent`); daily global, per-employee, per-department monthly and (new) company-monthly caps; kill switch now also stops a running employee. Needs `ANTHROPIC_API_KEY`. |
| 2 | Lead generation | READY WITH CONFIGURATION | Discover → dedupe → suppression → enrich → verify → intent → ICP → qualify → enrol, caps and kill switches tested. Needs Apollo or Hunter + NeverBounce or Hunter; CERTIFICATION PENDING. |
| 3 | CRM | READY | Existing CRM; prospects never auto-created as leads; no fabricated records. |
| 4 | Email | READY WITH CONFIGURATION | Sequences, suppression, unsubscribe, bounce/complaint/reply stop, email/outbound kill switches. Needs SMTP/Gmail + `GROWTH_UNSUBSCRIBE_SECRET`; certify with `CERTIFICATION_TEST_EMAIL`. |
| 5 | Social | READY WITH CONFIGURATION | Approval → atomic claim → budget → publish only with platform ID; metrics sync; refresh-on-401 for X and LinkedIn. Needs OAuth apps + app review; publishing certification REQUIRES HUMAN ACTION (no sandbox). YouTube upload NOT SUPPORTED by design. |
| 6 | Advertising | READY WITH CONFIGURATION | Paused by default, CEO policy chain, spend guard, emergency stop, kill switch, audit. Needs ad accounts + Google Ads developer token; live spend certification REQUIRES HUMAN ACTION. |
| 7 | Analytics | READY WITH CONFIGURATION | REAL / ESTIMATED / MANUAL / UNAVAILABLE / NOT_CONNECTED / STALE; briefing no longer claims ads are unimplemented; attribution by source/campaign/channel/currency with quality. GA4/GSC NOT CONNECTED. |
| 8 | Growth loop | READY WITH CONFIGURATION | 9 stages; each stage shows "BLOCKED BY <provider>"; CEO brief lists blockers; blocked stages never reported as done. |
| 9 | Sales | READY | Priorities, next-best actions, deal risk, forecast (ESTIMATED), attribution (REAL). |
| 10 | Delivery | READY | Project/client health, collections queue. |
| 11 | Finance | READY | Existing finance; collections reminders approval-gated. |
| 12 | Internal operations | READY | Recruiting, procurement (no self-approval), compliance, risk. |
| 13 | Regional | READY | Regional leaders and performance from records. |
| 14 | Security | READY WITH CONFIGURATION | See Security findings; needs `APP_ENCRYPTION_KEY` (32+). |
| 15 | Control loop | READY WITH CONFIGURATION | Hourly measure, ≤1 task/day/objective, ≤10 total, stop after 3 failures, budget pre-check, no task when a person must connect a provider, cancelled objectives ignored. Needs Anthropic to execute optimisation tasks. |

## What Phase 42 changed (no architecture replaced)

- **Provider health**: EXPIRED and RATE_LIMITED states; evidence-based classification (invalid credentials, expired/revoked, permission denied, rate limited, quota exhausted, timeout, network, 5xx, malformed); last success / last failure / failure kind; token expiry; non-secret account id; secrets scrubbed from every message and stored record (`lib/integrations/health-rules.ts`, `health.ts`).
- **OAuth**: actionable errors (cancelled, invalid state, expired code, client rejected, insufficient permission, unavailable, rate limited) — provider text only in the audit log (scrubbed); granted-scope check; LinkedIn refresh; audited refresh failures mark EXPIRED; Meta token expiry tracked; **provider-side revocation on disconnect** with an honest result.
- **AI**: optional `MAX_MONTHLY_AI_COST`; kill switch checked before every model call of a running employee.
- **Objectives**: "B2B"-style words no longer hide the target (the Step 10 objective parsed no target before); stage blockers; "Requires human action"; `getProviderBlockers` tool for the workforce.
- **Control loop**: human-only bottlenecks create no AI task; stop after 3 failed optimisation tasks; budget pre-check; cancelled/completed objectives ignored; skip reason recorded.
- **Certification mode** (`/admin/integrations/certification`): authenticated read-only checks; opt-in email only to the server's `CERTIFICATION_TEST_EMAIL`; opt-in ad campaign created PAUSED, never launched; social draft-only; every run audited.
- **Observability**: `/admin/company/today` — AI activity, approvals, audit entries (audit-log permission), metered cost, provider calls, provider-confirmed results; executive-only.
- **Analytics honesty**: NOT_CONNECTED / STALE markers; briefing reports platform ad results and GA4/GSC truthfully; revenue attribution.
- **Migrations**: none in Phase 42 (state kept in existing JSON columns).

## Security findings

| Check | Result |
|---|---|
| Repository secret scan (Anthropic/OpenAI/Google/AWS/GitHub/Slack/Stripe keys, private keys, JWTs, Meta tokens, Google OAuth secrets, DB URLs with passwords) | **NOT FOUND** as real secrets. 4 matches, all safe: `tests/os/company.test.ts` (synthetic fixtures for the redaction test), `tests/os/unit.test.ts` (synthetic Neon URL fixture), `prisma.config.ts` (localhost placeholder). Only `.env.example` is tracked; `.env*` is git-ignored. |
| Server/client boundary | All secret-handling modules are `server-only`; no client component imports them; only public `NEXT_PUBLIC_*` values (e.g. Turnstile site key) reach the browser. |
| Vault | AES-GCM, whitelisted names, masked hints; env precedence; no secret in audit metadata, health records, status rows or the day timeline (asserted in tests). |
| OAuth | State random, server-side, user-bound, single-use, 10-minute TTL; PKCE for X and Google; callback requires `integrations:manage`; replay, expiry and cross-user attempts rejected (tested). |
| RBAC | New pages: certification (`integrations:view`, run `integrations:manage`, paused ad campaign also `growth:control`); day timeline (`executive:view`, audit entries also `audit:view`). |
| Webhooks / cron | Stripe, Razorpay, Calendly, Twilio, Exotel, growth email events verify signatures; cron routes require `CRON_SECRET`. |
| Sessions / CSRF | Session cookie `httpOnly`, `sameSite=lax`, `secure` in production; server actions use Next's origin checks; login throttle per email and per IP. |
| Rate limits | Provider daily caps, 429 cool-down, one GET retry; login throttle. |
| Kill switches and approvals | Enforced server-side in the engines (all eight tested on real code paths), not UI-only. |
| LOW | `/api/health/db` is public: returns booleans, the deploy environment name and commit (no values). Marked temporary in code — remove or protect before activation (REQUIRES HUMAN ACTION). |

## Database findings

- No schema change and no migration in Phase 42. Since `c705fca` two migrations were **added** (none modified): `20260930090000_ai_company`, `20261001090000_ai_company_operations`; neither contains DROP, TRUNCATE, DELETE or a type-changing ALTER.
- Prisma schema valid; test database has no drift; migration status up to date.
- **Production risk:** `npm run build` runs `prisma migrate deploy` against `DATABASE_URL`. This session's environment points `DATABASE_URL` at a Neon host; every Phase 42 command pinned the local `shivacha_test` database and set `SKIP_DB_MIGRATE=1`. Production Neon was not touched.

## Test results

| Suite | Result |
|---|---|
| Node ×3 consecutive (no shared state) | os 9, admin 10, ai 12, workforce 7, unified 17, router 80, growth 16, growth:db 12, growth:safety 21, voice 15, unified:db 6, company 17, company:db 20, company:ops 7, **activation 10 (new)**, clock — all green every run |
| Routes (public site, 741) ×3 on a fresh server | all passed |
| Browser ×2 | company-e2e 66 checks pass; smoke (all admin + AI company routes) pass; growth-e2e pass |
| Browser ×2, pre-existing failures | `tests/os/flow.mjs` 24/26; `tests/admin/e2e.mjs` 26/28 — identical on `c705fca` |
| Production build | passes |

## Regression comparison against `c705fca`

- **NEW REGRESSIONS: none.**
- **PRE-EXISTING (identical on `c705fca`):**
  1. `tests/os/flow.mjs` — "countersigned PDF uploaded" and a `selectOption` timeout.
  2. `tests/admin/e2e.mjs` — "super admin reaches dashboard": the suite's own brute-force check locks out 127.0.0.1 (per-IP login throttle) right before the super-admin login. Test ordering, not a product defect.
  3. **Public-site defect (production impact):** after an admin saves CMS/settings (site-wide `revalidatePath("/", "layout")` in `lib/admin/system-actions.ts`), the 11 route groups with `dynamicParams = false` (e.g. `/capabilities/*`, `/resources/*`, `/lp/*`) return 404 on that server until the next deploy (292 URLs; Next.js `NoFallbackError`). Reproduced on the baseline build. Proposed fix (not applied — outside this phase, needs a decision): set `dynamicParams = true` on those routes (they already call `notFound()` for unknown slugs) and re-run the route check after a settings save.

## Human actions required before activation

1. Set `APP_ENCRYPTION_KEY` (32+ chars), `GROWTH_UNSUBSCRIBE_SECRET`, `CERTIFICATION_TEST_EMAIL` (a controlled inbox), optionally `MAX_MONTHLY_AI_COST`.
2. Connect and certify, in this order: Anthropic → Apollo or Hunter → NeverBounce → SMTP/Gmail → Google (GA4, GSC) → LinkedIn / Meta / X apps (register the redirect URL shown on the Integrations page; complete provider app review for posting and ads scopes) → ad accounts (+ Google Ads developer token).
3. Set the ads policy (daily spend limit is required for any launch); keep autonomy OFF until a human-launched campaign has been certified end to end (launch → spend sync → automatic pause).
4. Certify publishing by approving one real post per platform.
5. Decide on the pre-existing `dynamicParams` 404 defect and on `/api/health/db`.
6. Deploy only through the normal production pipeline (not from an ad-hoc shell whose `DATABASE_URL` is production).
