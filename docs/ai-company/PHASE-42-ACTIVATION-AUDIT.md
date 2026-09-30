# Phase 42 — Step 0: production activation audit

Audited **before** any Phase 42 change, on branch `claude/inspiring-rubin-39bo23` at `b8b3ad5` (production baseline
`c705fca`, Phase 30–41 commits `46231d5`, `c317df6`, `03aed10`, `68e0ebb`, `8c90651`, `b8b3ad5`). Working tree clean.

## Environment facts (this session)

| Fact | Finding |
|---|---|
| Provider credentials | **None set.** Anthropic, OpenAI, Gemini, Apollo, Hunter, NeverBounce, LinkedIn/Meta/X/Google OAuth apps, YouTube, ad accounts, GA4, GSC, SMTP/Gmail: all unset; no encrypted vault entries in the test DB. Every provider is therefore **NOT_CONNECTED** and no live certification call is possible here. |
| `APP_ENCRYPTION_KEY` | Unset in the session environment (tests set a throw-away key). Production must set a 32+ character key or the vault refuses to store credentials. |
| `DATABASE_URL` | **Set by the session environment to a Neon host** (not verified whether it is production). All Phase 42 work pins `DATABASE_URL` to the local `shivacha_test` database and sets `SKIP_DB_MIGRATE=1`; DB test suites refuse any database not named `shivacha_test`. |
| Build-time migrations | `npm run build` runs `scripts/db/migrate-on-build.mjs` → `prisma migrate deploy` against whatever `DATABASE_URL` holds (skipped only for Vercel previews or `SKIP_DB_MIGRATE=1`). **Risk:** an unpinned build in an environment whose `DATABASE_URL` is production migrates production. Correct for Vercel production deploys; dangerous in ad-hoc shells. |
| Migrations since baseline | `20260930090000_ai_company`, `20261001090000_ai_company_operations` — additive (tables, nullable columns, indexes). |

## Provider matrix

State = state in this environment. Live test = what a real certification call would be once credentials exist.

| Capability | Provider | Credentials / env | OAuth | State | Live-test possibility | Production risk | Missing configuration | Recommended certification test |
|---|---|---|---|---|---|---|---|---|
| AI employees (all 60) | Anthropic | `ANTHROPIC_API_KEY` (vault or env); `AI_MODEL`, `MAX_DAILY_AI_COST`, `MAX_REQUEST_TOKENS` | no | NOT_CONNECTED | Read-only `GET /v1/models`; one metered 1-turn task | Cost — capped by global daily, per-employee daily and per-department monthly limits; **no company-wide monthly cap** | API key | Test in Integration Center; run one ASSIST task; confirm AIUsage cost row |
| Voice STT/TTS | OpenAI | `OPENAI_API_KEY` | no | NOT_CONNECTED | `GET /v1/models` | Low (metered) | API key | Integration test + one voice sample |
| — | Gemini | `GEMINI_API_KEY` | no | NOT_CONNECTED (status only; no feature uses it) | `GET models` | None | optional | Connection test only |
| Lead discovery | Apollo | `APOLLO_API_KEY` | no | NOT_CONNECTED | `GET /v1/auth/health`; people search `per_page=1` | Credits; capped 500 calls/day | API key | Health test; pipeline run with `maxDiscover=1` on a certification campaign |
| Lead discovery / email finder / verify | Hunter | `HUNTER_API_KEY` | no | NOT_CONNECTED | `GET /v2/account` | Credits | API key | Account test; verify one known address |
| Email verification | NeverBounce | `NEVERBOUNCE_API_KEY` | no | NOT_CONNECTED | `GET /v4/account/info` | Credits | API key | Account test; single check of a controlled address |
| Page posts + metrics; LinkedIn Ads | LinkedIn | `LINKEDIN_CLIENT_ID/SECRET` → sign-in stores `LINKEDIN_ACCESS_TOKEN` (+refresh); `LINKEDIN_ORGANIZATION_URN` | yes | NOT_CONNECTED | Sign-in; `socialActions`/org read | Public posting (approval-gated) | App registration with Community Management + Advertising API products; org URN | OAuth sign-in → identity check → draft-only post certification |
| Facebook Page, Instagram, Meta Ads | Meta | `META_APP_ID/SECRET` → user token, page token, page id, IG business id; `META_AD_ACCOUNT_ID` | yes | NOT_CONNECTED | `/me`, `/me/accounts`, ad account read | Public posting; ad spend | App review for `pages_manage_posts`, `instagram_content_publish`, `ads_management` | OAuth → page discovery → draft-only post → paused ad campaign, never activated |
| X posts + metrics | X | `X_CLIENT_ID/SECRET` → access + rotating refresh token, user id | yes (PKCE) | NOT_CONNECTED | `/2/users/me` | Public posting; paid API tier limits | App with OAuth 2.0 user context | OAuth → identity → refresh-token rotation test → draft-only |
| YouTube metrics | YouTube Data API | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` | no (key) | NOT_CONNECTED | channel statistics | None (read-only; uploads are NOT_SUPPORTED) | API key, channel id | Metrics read only |
| Analytics; Google Ads auth | Google | `GOOGLE_OAUTH_CLIENT_ID/SECRET` → refresh token; `GA4_PROPERTY_ID`, `GSC_SITE_URL` | yes (PKCE, offline) | NOT_CONNECTED | Token refresh; GA4 runReport; GSC query | None (read-only) | OAuth consent screen verification for the scopes | Sign-in → GA4 7-day report → GSC 28-day report |
| Google Ads | Google Ads API | `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` (+ login customer id) | via Google | NOT_CONNECTED | `customers/{id}` read | Ad spend | Developer token (test-account level first) | Google Ads **test account** → paused campaign create; no activation |
| Growth email / outreach | SMTP or Gmail OAuth | `SMTP_USER/PASS` or `GMAIL_OAUTH_*`; `GROWTH_UNSUBSCRIBE_SECRET` | Gmail optional | NOT_CONNECTED | No read-only probe exists | Outbound email to real people | Mail credentials, unsubscribe secret | Send only to a controlled recipient (certification mode) |
| Web research | Anthropic web search | `AI_WEB_SEARCH=1` + Anthropic | no | NOT_CONNECTED | One sourced research task | Cost | Anthropic | Research task with sourced findings |
| WhatsApp | Communication center | provider env | no | status only | — | — | — | out of scope |

## Module audit

| Module | Implemented | Gap found in this audit |
|---|---|---|
| Integration Center | CONNECTED / NOT_CONNECTED / NOT_SUPPORTED / ERROR; masked hints; usage; cool-down | No **EXPIRED** or **RATE_LIMITED** state; no last-success vs last-failure; no token expiry or safe account identifier; ERROR text is the raw provider message |
| OAuth | State single-use, user-bound, 10-min TTL, PKCE (X, Google), encrypted tokens, audit on connect | Provider cancellations shown raw; no classification (cancelled / invalid state / expired / insufficient permission / unavailable / rate limited); **disconnect does not revoke at the provider**; LinkedIn/Meta token expiry never detected; no audit of refresh failures |
| AI | Central `runAgent` + router; daily global, per-employee, per-department monthly budgets; kill switches | **No company-wide monthly AI cap** |
| Lead engine | Full pipeline incl. enrichment and enrolment, caps, suppression, kill switch | No certification mode for a controlled live test; role/company/geography filtering is ICP-score based (documented) |
| Social | Draft → approval → publish with platform confirmation; metrics | Certification is draft-only by rule (no platform sandbox for page posts) |
| Advertising OS | Paused-by-default, policy chain, spend guard, emergency stop, kill switch | Certification must stop at "created PAUSED" |
| Analytics | REAL / ESTIMATED / MANUAL / UNAVAILABLE | No **NOT_CONNECTED** / **STALE** markers; no revenue attribution by source/campaign/channel/currency |
| Objectives | 9-stage lead playbook, honest BLOCKED | **The Step 10 objective ("…100 qualified international B2B leads per day…") parses no target** — "B2B" contains a digit; no per-stage "BLOCKED BY <provider>" list for the CEO |
| Control loop | Hourly measure, daily message, ≤1 task/day, ≤10 total | A loop task that keeps failing is recreated daily until the cap (no permanent-failure stop) |
| Kill switches | All eight enforced server-side in the engines | No single automated test covering all eight |
| Observability | Audit log, AI activity, objective timeline | No "what did the AI company do today" view across records |
| Security | server-only on all secret modules; vault whitelist; webhooks signed; cron secret | `/api/health/db` is public (booleans + deploy env/commit only — no values); repository secret scan: see Step 12 in the activation report |

The certification results and fixes are in `PRODUCTION-ACTIVATION-REPORT.md`.
