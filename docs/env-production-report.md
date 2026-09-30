# Production environment variables (VPS)

Scanned 2026-09-28 on the production branch `claude/fervent-johnson-reh1oy` (PRs #2 to #7 merged) and on open PR #8
(`claude/project-thread-w5stq5`, AI Control Center). PR #8 adds **no new environment variables**.

Every name comes from a `process.env` read in the code (including the dynamic `set("NAME")` checks in
`lib/os/integrations.ts` and `app/admin/(panel)/security/page.tsx`, and the direct-URL list in
`scripts/db/migration-url.mjs`). 83 names are production-relevant; all 83 are in `.env.production.example`.

**Legend.** Required = the site or a core feature breaks without it. Recommended = has a code default or a safe
fallback, but production should set it. Optional = only for that integration. Build = read by `npm run build`
(Next.js inlines `NEXT_PUBLIC_*` into the bundle; migrations run in the build). Runtime = read by `npm start`.

## Core

| Variable | Need | Scope | Used in | When |
|---|---|---|---|---|
| NEXT_PUBLIC_SITE_URL | Recommended (default https://shivacha.com) | NEXT_PUBLIC | data/siteConfig.ts, lib/communication/ivr.ts | Build |
| DATABASE_URL | **Required** (admin, CRM, auth, AI, cron) | Server | lib/db/client.ts, lib/auth/session.ts, lib/portal/session.ts, lib/cms/*, lib/leads/*, cron routes, app/api/health/db, prisma.config.ts, scripts/db/* | Build (migrations) + Runtime |
| DATABASE_URL_UNPOOLED | Recommended (auto-derived from a Neon `-pooler` URL if unset) | Server | scripts/db/migration-url.mjs, scripts/db/migrate-on-build.mjs, lib/db/client.ts (diagnostics) | Build (migrations only) |
| DIRECT_DATABASE_URL / POSTGRES_URL_NON_POOLING / DIRECT_URL | Optional aliases of the above | Server | scripts/db/migration-url.mjs | Build |
| DATABASE_POOL_MAX | Optional (default 5) | Server | lib/db/client.ts | Runtime |
| SKIP_DB_MIGRATE | Optional | Server | scripts/db/migrate-on-build.mjs | Build |
| MIGRATE_LOCK_RETRIES | Optional (default 5) | Server | scripts/db/migrate-on-build.mjs | Build |
| APP_ENCRYPTION_KEY | **Required** for admin 2FA (32+ chars) | Server | lib/auth/totp.ts, lib/security/actions.ts, admin account & security pages | Runtime |
| CRON_SECRET | **Required** for schedulers | Server | app/api/cron/daily, app/api/cron/workforce, admin system & security pages | Runtime |
| AUTOMATION_WEBHOOK_SECRET | Recommended | Server | lib/automation/engine.ts, admin security page | Runtime |

## AI workforce, execution router, voice employees

| Variable | Need | Scope | Used in | When |
|---|---|---|---|---|
| ANTHROPIC_API_KEY | **Required** for any AI output (agents, tasks, router, voice replies) | Server | lib/ai/provider.ts, lib/ai/runner.ts, lib/ai/workforce/engine.ts, lib/voice/session.ts, admin AI pages | Runtime |
| MAX_DAILY_AI_COST | Recommended (default 10 USD) | Server | lib/ai/cost.ts, lib/ai/provider.ts, admin AI costs page | Runtime |
| MAX_REQUEST_TOKENS | Recommended (default 150000) | Server | lib/ai/cost.ts, lib/ai/provider.ts, admin AI costs page | Runtime |
| MAX_TASK_TOKENS | Optional (default 400000) | Server | lib/ai/workforce/engine.ts | Runtime |
| AI_MODEL | Optional (default claude-opus-5) | Server | lib/ai/runner.ts, lib/ai/provider.ts, admin AI pages | Runtime |
| AI_WEB_SEARCH | Optional (`true`) | Server | lib/ai/tools.ts, lib/ai/provider.ts | Runtime |
| WORKFORCE_TIMEZONE | Optional (default Asia/Kolkata) | Server | lib/ai/workforce/profiles.ts | Runtime |
| OPENAI_API_KEY | Optional (server speech; browser speech works without) | Server | lib/voice/provider.ts | Runtime |
| OPENAI_STT_MODEL / OPENAI_TTS_MODEL | Optional | Server | lib/voice/provider.ts | Runtime |

The execution router (PR #7) and Control Center / kill switch (PR #8) read no variables of their own; they use
DATABASE_URL and ANTHROPIC_API_KEY.

## Uploads, email, forms, leads

| Variable | Need | Scope | Used in | When |
|---|---|---|---|---|
| BLOB_READ_WRITE_TOKEN | **Required** unless ALLOW_LOCAL_UPLOADS=1 | Server | lib/storage.ts, lib/os/documents.ts, media/document/employee actions | Runtime |
| ALLOW_LOCAL_UPLOADS | Alternative to Blob (`1`) | Server | lib/storage.ts, lib/os/documents.ts | Runtime |
| LEAD_NOTIFY_TO | **Required** for lead emails | Server | lib/leads/pipeline.ts, lib/email/mailer.ts | Runtime |
| MAIL_FROM | Recommended | Server | lib/email/mailer.ts | Runtime |
| HR_NOTIFY_TO | Optional | Server | lib/leads/pipeline.ts | Runtime |
| SUPPORT_EMAIL | Optional | Server | lib/support/actions.ts | Runtime |
| SMTP_USER, SMTP_PASS | **Required** (or the Gmail OAuth set) | Server | lib/email/mailer.ts, lib/communication/providers.ts | Runtime |
| SMTP_HOST, SMTP_PORT, SMTP_SECURE | Optional (Gmail 465 defaults) | Server | lib/email/mailer.ts | Runtime |
| GMAIL_USER, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN | Alternative to SMTP | Server | lib/email/mailer.ts | Runtime |
| NEXT_PUBLIC_TURNSTILE_SITE_KEY | Recommended (pair) | NEXT_PUBLIC (site key, not secret) | components/leads/InquiryForm.tsx, components/forms/LeadForm.tsx | Build |
| TURNSTILE_SECRET_KEY | Recommended (pair) | Server | app/api/lead/route.ts | Runtime |
| LEAD_STORE, LEADS_FILE | Optional | Server | lib/leads/store.ts | Runtime |
| GOOGLE_SHEETS_WEBHOOK_URL, GOOGLE_SHEETS_WEBHOOK_SECRET | Optional | Server | lib/leads/store.ts | Runtime |
| GOOGLE_SHEETS_LEADS_ID, GOOGLE_SHEETS_LEADS_TAB | Optional | Server | lib/leads/store.ts, scripts/setup-lead-sheet.ts | Runtime |
| GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | Optional | Server | lib/google/serviceAccount.ts, lib/marketing/attribution.ts | Runtime |
| CRM_WEBHOOK_URL, CRM_WEBHOOK_SECRET | Optional | Server | lib/leads/store.ts | Runtime |

## Payments, webhooks, Calendly, WhatsApp, telephony

| Variable | Need | Scope | Used in | When |
|---|---|---|---|---|
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | Optional | Server | lib/payments/stripe.ts | Runtime |
| RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET | Optional | Server | lib/payments/razorpay.ts | Runtime |
| CALENDLY_WEBHOOK_SIGNING_KEY | Optional (webhook rejected without it) | Server | app/api/webhooks/calendly/route.ts | Runtime |
| NEXT_PUBLIC_CALENDLY_URL | Optional (default calendly.com/shivacha-sales) | NEXT_PUBLIC | lib/calendly.ts | Build |
| WHATSAPP_SALES_NUMBER | Optional (default 918171133917) | Server, copied to NEXT_PUBLIC_WHATSAPP_SALES_NUMBER by next.config.ts | next.config.ts, admin settings page | Build |
| NEXT_PUBLIC_WHATSAPP_SALES_NUMBER / _US_NUMBER / _UK_NUMBER | Optional | NEXT_PUBLIC (phone numbers) | data/siteConfig.ts | Build |
| WHATSAPP_CLOUD_TOKEN, WHATSAPP_PHONE_NUMBER_ID | Optional | Server | lib/communication/providers.ts | Runtime |
| TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_WEBHOOK_BASE_URL | Optional | Server | lib/communication/providers.ts, ivr.ts, actions.ts | Runtime |
| EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_WEBHOOK_TOKEN | Optional | Server | lib/communication/providers.ts, app/api/webhooks/exotel | Runtime |

## Visitor intelligence, analytics, marketing

| Variable | Need | Scope | Used in | When |
|---|---|---|---|---|
| IPINFO_TOKEN | Optional | Server | lib/visitors/company.ts, lib/visitors/policy.ts | Runtime |
| NEXT_PUBLIC_GA_ID, NEXT_PUBLIC_META_PIXEL_ID, NEXT_PUBLIC_LINKEDIN_PARTNER_ID | Optional | NEXT_PUBLIC (tag ids) | components/layout/Analytics.tsx | Build |
| NEXT_PUBLIC_GSC_VERIFICATION | Optional | NEXT_PUBLIC (meta tag) | app/layout.tsx | Build |
| GA4_PROPERTY_ID, GSC_SITE_URL, META_ADS_*, GOOGLE_ADS_*, LINKEDIN_ADS_* | Optional | Server | lib/marketing/attribution.ts | Runtime |

## Deliberately not in the file

- **NODE_ENV**: set to `production` by `next build` / `next start`; don't set it by hand.
- **VERCEL_ENV, VERCEL_GIT_COMMIT_REF, VERCEL_GIT_COMMIT_SHA, MIGRATE_ON_PREVIEW**: Vercel-only. On a VPS VERCEL_ENV is
  absent, so `npm run build` always runs `prisma migrate deploy` when DATABASE_URL is set.
- **ADMIN_PASSWORD**: one-off input to `npm run admin:create`; never store it.
- **ADMIN_E2E_*, BASE_URL, CHROME_PATH, QA_OUT, SMOKE_ROUTES**: test/QA scripts only.
- **DOCUSIGN_*, DROPBOX_SIGN_***: listed by name in lib/sales/esign.ts but never read (providers are not implemented).
- Neon-integration names POSTGRES_PRISMA_URL, POSTGRES_URL, NEON_DATABASE_URL are only reported by name in
  diagnostics and never used for a connection.

## Checks

1. **Existing Neon setup: verified.** DATABASE_URL (pooled, runtime + build migrations) and DATABASE_URL_UNPOOLED
   (direct, migrations only) both exist in code and in `.env.example`.
2. **Existing AI setup: verified.** ANTHROPIC_API_KEY, MAX_DAILY_AI_COST and MAX_REQUEST_TOKENS exist. APP_ENCRYPTION_KEY
   exists but is **not an AI setting**: it encrypts admin 2FA secrets.
3. **No hardcoded secrets.** Searched all tracked files (both branches) for Anthropic/OpenAI/Stripe/Razorpay/Twilio/
   AWS/Google/GitHub/Vercel Blob/Neon key formats, private-key blocks, JWTs and Postgres URLs with passwords. Only
   matches: a `placeholder` Postgres URL in prisma.config.ts and `PASTE_A_LONG_RANDOM_SECRET` in
   docs/google-apps-script/leads.gs (a template). No `.env` file with values has ever been committed; the only tracked
   env file is `.env.example` (empty values).
4. **No secret in NEXT_PUBLIC_*.** The 10 public names are the site URL, Calendly link, three WhatsApp numbers, the
   Turnstile *site* key and four analytics/verification ids, all designed to be public. No `"use client"` file reads a
   non-public variable.
5. **.gitignore.** `.env*` already ignored all four files; this change adds the explicit lines `.env`, `.env.local`,
   `.env.production`, `.env.production.local` and `!.env.production.example` (without that exception the new example
   file itself would have been ignored). Verified with `git check-ignore`.

## VPS notes found during the scan

- **Cron.** `vercel.json` crons do not run on a VPS. Add system cron entries that call
  `GET /api/cron/daily` (daily, Vercel schedule was 03:30 UTC) and `GET /api/cron/workforce` (every 10 to 15 minutes)
  with header `Authorization: Bearer <CRON_SECRET>`.
- **Local uploads.** With ALLOW_LOCAL_UPLOADS=1 files are written to `public/uploads/` at runtime. `next start` only
  serves `public/` files that existed at build time, so serve `/uploads/` from nginx (or use BLOB_READ_WRITE_TOKEN).
- **Build uses the production DB.** `npm run build` applies migrations to DATABASE_URL; that is intended on the
  production server only.
