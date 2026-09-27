# Shivacha Technologies — Website

The digital headquarters of **Shivacha Technologies**: *Technology for companies building what comes next.*

AI · Digital · FinTech · Web3 · Cloud — Products · Services · Solutions · Engineering Teams · Technologies · Resources.

- **705 statically generated routes** (all pass HTTP 200 / single-H1 / unique title & description / canonical / breadcrumb schema checks)
- **Fully data-driven** — every page is rendered from typed content in [`/data`](data); adding a product, service or article means adding data, not components
- Lighthouse (local production build): Performance 92–96 · Accessibility 100 · Best Practices 100 · SEO 100

## Stack

Next.js 16 (App Router, React Server Components, static generation) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion (one interactive visual) · Lucide icons · Geist fonts (self-hosted).

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — see "Environment variables"
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
```

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (next/core-web-vitals + typescript) |
| `npm run check:content` | Verifies every slug referenced in `/data` resolves and every slug is unique |
| `npm run check:demos` | Verifies every configured product demo URL responds (https only) |
| `BASE_URL=http://localhost:3000 npm run test:routes` | Crawls every route against a running server: status, H1, unique metadata, canonical, breadcrumbs, broken internal links |
| `BASE_URL=http://localhost:3000 npm run qa:layout` | Visual/layout QA: every route at 1440 / 768 / 390 px and one route per template at 12 viewports (1920 → 360). Flags horizontal overflow (naming the culprit element), overlapping text/controls, floating-widget collisions, missing alt, broken image URLs, H1 count and console errors. `-- --full` runs every route at every viewport. Needs Chromium (`CHROME_PATH`, default `/opt/pw-browsers/chromium`). |
| `npm run test:clock` | Verifies the footer world clock time-zone maths, including US and UK daylight-saving transitions |

## Route map

| Section | Routes | Source data |
| --- | --- | --- |
| Home | `/` | composed from all data |
| Capabilities | `/capabilities`, `/capabilities/{ai,digital,fintech,web3,cloud}` | `data/capabilities.ts` |
| Services | `/services`, `/services/[slug]` (311) | `data/services/*.ts`, `data/serviceGroups.ts` |
| Products | `/products`, `/products/[slug]` (48) | `data/products/*.ts`, `data/demoLinks.ts` |
| Solutions | `/solutions`, `/solutions/[slug]` (15, incl. `web2-web3-fintech`) | `data/solutions.ts` |
| Industries | `/industries`, `/industries/[slug]` (19) | `data/industries.ts` |
| Technologies | `/technologies`, `/technologies/[slug]` (134 in 14 categories) | `data/technologies/*.ts` |
| Dedicated teams | `/dedicated-teams`, `/dedicated-teams/[slug]` (24) | `data/teams.ts` |
| Work | `/work`, `/work/{case-studies,ai,digital,fintech,web3,cloud}`, `/work/[slug]` | `data/caseStudies.ts` |
| Markets | `/markets`, `/markets/[slug]` (5 regions + 16 countries) | `data/markets.ts` |
| Resources | `/resources`, `/resources/[category]`, `/resources/[category]/[slug]` | `data/resources.ts` |
| Insights | `/insights`, `/insights/[category-or-slug]` | `data/insights.ts` |
| Company | `/company`, `/company/[slug]` (about, vision, mission, leadership, founder, engineering, technology, culture, global-presence, partners) | `data/company.ts`, `data/leadership.ts` |
| Careers | `/careers`, `/careers/[department-or-track]` | `data/careers.ts` |
| Conversion | `/contact`, `/start-a-project`, `/request-demo`, `/book-a-meeting`, `/hire-developers` | `components/forms/LeadForm.tsx` |
| Legal | `/privacy-policy`, `/terms`, `/cookie-policy`, `/disclaimer`, `/security`, `/accessibility` | `data/legal.ts` |
| System | `/sitemap.xml`, `/robots.txt`, `/search-index.json`, `/opengraph-image`, `/api/lead` | `app/*` |

Legacy URLs from the previous site (`/about`, `/team`, `/why-us`, `/hire-us`, `/solutions/blockchain`) and the corrected paths from the brief (`/nginx`, `/linux`, `/south-africa`) are permanently redirected in `next.config.ts`.

## Project structure

```
app/                  Routes (one thin page per route type; templates do the rendering)
components/
  layout/             Header + mega menus, mobile nav, footer, ⌘K command palette, analytics loader
  templates/          Capability, Service, Product, Solution, Industry, Technology, Team,
                      CaseStudy, Market, Resource, Insight, Career templates
  sections/           Reusable page sections (hero, FAQ + schema, CTA, grids, explorers, filters)
  visuals/            Ecosystem map, layered architecture, hybrid fintech diagram, product UI previews
  forms/              LeadForm (all lead types), newsletter, product-view tracking
  ui/                 Primitives, breadcrumbs (+ JSON-LD), icons, division tokens
data/                 All content (typed in data/types.ts)
lib/                  SEO metadata, JSON-LD, internal-linking engine, search index, validation, analytics, route list
scripts/              Content, demo-link and route/SEO checks
```

## Brand assets

The official logo lives in [`public/brand`](public/brand): the original files (`shivacha-mark-original.jpg`, `shivacha-logo-original.png`) plus vector versions traced from them — `shivacha-mark.svg`, `shivacha-wordmark.svg` (white, for dark backgrounds), `shivacha-logo.svg` (full lockup, white text) and `shivacha-logo-dark.svg` (dark text, for light backgrounds). Brand blue is `#0195FF`; the site theme (`app/globals.css`) derives from it — a `brand-300…700` scale, navy-tinted surfaces and an analogous division palette (AI indigo, Digital blue, FinTech teal, Web3 cyan, Cloud sky). The header/footer logo (`components/layout/Logo.tsx`), favicon (`app/icon.svg`), Apple touch icon and Open Graph image all use these paths (`lib/brand/*`).

## Visual system

- **System visuals** (`components/visuals/SystemVisuals.tsx`) are code-drawn product and architecture views that explain how a system works: platform topology (home hero), AI agent run with human approval, payment flow with a balanced ledger entry, Web3 contract → indexer pipeline, multi-region cloud topology, layered security controls and a web + mobile release view. `DivisionArt` picks one by division/topic, so every service, industry, solution, team and hire hero is covered. They use container queries (adapt to any column), transform-only data-flow animation and respect `prefers-reduced-motion`; sample identifiers are labelled *Illustrative*.
- **Product UIs** (`components/visuals/DashboardPreview.tsx`) render realistic dashboards per product (exchange, wallet, banking, cards, payments, tokenization, AI agents…) with *Illustrative interface · sample data* captions.
- **3D renders** in `public/graphics/3d-*.{png,jpg}` (rendered offline from `scripts/graphics/scenes.js`) are used for the office globe (company pages), article covers and the CTA band. The site uses a single light theme.
- **Footer world clock** (`components/layout/WorldClock.tsx`): analog + digital clocks for New York, London, New Delhi, Dubai and Riyadh from the browser's IANA time-zone data (DST automatic, nothing time-dependent rendered on the server).
- **Technology logos** come from [simple-icons](https://simpleicons.org) (CC0) via `lib/brand/techLogos.ts`; `TechLogo` falls back to a lettermark when a brand has no icon. Logos identify the technologies we build with and imply no partnership.
- **Icons on cards** are picked automatically from the card title by `components/graphics/autoIcon.tsx` (keyword → Lucide icon), so new data gets sensible icons without extra fields.
- **Section bands** alternate automatically (`main > section:nth-of-type(even)`); pass `tone="brand"` to `Section` for a dark navy band.

## Content model

All content types are defined in [`data/types.ts`](data/types.ts). Highlights:

- **Divisions** (`data/capabilities.ts`) — the five headline divisions (Web3, FinTech, Digital Assets, AI, Cloud; `primary: true`) plus the Product Engineering practice (`digital`), each with tagline, flagship offerings, premium CTA and typical implementation ranges (`launch`).
- **Launch data** (`data/launch.ts`) — white-label metadata per product: typical software implementation range, delivery tier, customization level, key modules, SEO title and the homepage *Ready-to-launch platforms* order. `serviceToProduct` links custom-build service pages to their white-label foundation. Every timeline is shown with `LAUNCH_DISCLAIMER`: it covers software implementation only — never licences, banking/card-issuer onboarding, custody/liquidity agreements or audits. Only give a product a timeline when its white-label foundation genuinely supports it.
- **Service groups** (`data/serviceGroups.ts`) — 33 service areas holding shared context: intro, reference architecture, delivery process, engineering considerations, FAQs, default technologies/industries/products and the matching dedicated team. FinTech groups carry a `track` (**Web2 FinTech**, **Web3 FinTech**, **Hybrid FinTech**) so the three are never merged.
- **Services** — authored compactly with the `svc()` helper; each has a unique summary (meta description), overview, use cases, capabilities and FAQs, plus optional explicit relations and regulatory notes.
- **Products** — the `Product` interface from the brief plus problem/solution, feature modules, use cases, architecture and a `preview` kind used to render an illustrative UI in code.

### Adding content

- **A service:** add an `svc(...)` entry to the relevant file in `data/services/` with an existing `group`. It automatically appears in the services index, its capability page, related-service blocks, search and the sitemap.
- **A product:** add a `prod({...})` entry in `data/products/`. Deployment, customisation and security fall back to sensible per-division defaults.
- **A demo URL / screenshots:** edit **only** [`data/demoLinks.ts`](data/demoLinks.ts). A product shows **Live Demo** only when it has an absolute `https://` URL; otherwise it shows **Request Demo** (and **Book Demo**). Run `npm run check:demos` before publishing.
- **An article / resource / case study:** add an entry to `data/insights.ts`, `data/resources.ts` or `data/caseStudies.ts`.

Run `npm run check:content` after any edit — it fails on unknown or duplicate slugs.

## Internal linking engine

[`lib/relations.ts`](lib/relations.ts) derives every "related" block from structured data: related services (same group → explicit → same division), products, technologies, industries, insights, resources, case studies and the matching dedicated team, plus reverse lookups (e.g. which services and products use a technology). Nothing is linked by hand in templates.

## SEO

- Unique `<title>`, meta description, canonical, Open Graph and Twitter metadata on every page (`lib/seo.ts`), verified by `test:routes`.
- JSON-LD: Organization + WebSite (global), BreadcrumbList (every page), Service, SoftwareApplication (products), Article (insights, case studies), FAQPage (wherever FAQs render), Person (founder).
- `sitemap.xml` is generated from `lib/routes.ts`; empty resource categories render an honest "nothing published yet" page and are `noindex` + excluded from the sitemap.

## Search

`⌘K` / `Ctrl+K` (or the header button) opens a command palette. The index (`/search-index.json`, ~630 entries across products, services, capabilities, technologies, industries, solutions, teams, case studies, insights, resources and markets) is generated at build time and fetched only when the palette first opens, so it adds nothing to page weight.

## Lead capture system

**Flow:** visitor → *Discuss Your Project* / *Book a Call* → two-step form → lead saved → email to **sales@shivacha.com** → confirmation email to the visitor → Calendly booking + WhatsApp → sales follow-up.

| Piece | Where |
| --- | --- |
| Two-step inquiry form (name, work email, WhatsApp/phone → company, service, budget, description; only name + email required) | `components/leads/InquiryForm.tsx` — on `/start-a-project` and in the modal |
| Floating **Talk to Shivacha** button (Book a Call / Send Project Inquiry / WhatsApp) | `components/leads/TalkToShivacha.tsx` |
| Calendly: `BookCallButton` (labels: Book a Call, Schedule a Consultation, Talk to an Expert, Book a Free Consultation), in-site modal, inline embed on `/book-a-meeting`, booking tracking | `components/leads/BookCall.tsx`, `lib/calendly.ts` |
| Service / budget options, CRM statuses | `lib/leads/options.ts` |
| API: validation, CSRF, rate limits, honeypot, Turnstile, email-domain check | `app/api/lead/route.ts`, `lib/validation.ts` |
| Pipeline: save → notify sales → confirm visitor → webhook; lead ID, score, follow-up date | `lib/leads/pipeline.ts`, `lib/leads/score.ts` |
| Lead database (Google Sheet / JSONL file) | `lib/leads/store.ts`, `lib/leads/columns.ts` |
| Emails (Google Workspace SMTP or Gmail OAuth2) and templates | `lib/email/mailer.ts`, `lib/email/templates.ts` |

All other forms (contact, demo, meeting, hire, resource) use the same pipeline. Job applications notify **hr@shivacha.com**; newsletter sign-ups are stored without emails.

### Setup (all values are server-side environment variables — see `.env.example`)

1. **Calendly** — the booking link is `https://calendly.com/shivacha-sales` (default in `lib/calendly.ts`; override with `NEXT_PUBLIC_CALENDLY_URL`). If the value is not a calendly.com link, *Book a Call* opens the on-site meeting request form instead.
2. **Email via Google Workspace** (no new mailbox — everything sends from and to `sales@shivacha.com`):
   - *Simplest:* in the `sales@` Google account enable 2-Step Verification, create an **App Password**, then set `SMTP_USER=sales@shivacha.com` and `SMTP_PASS=<app password>`.
   - *No stored password:* create an OAuth client in Google Cloud, authorise `sales@shivacha.com` for scope `https://mail.google.com/`, then set `GMAIL_USER`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`.
   - Test: `npm run leads:test-email -- you@example.com`.
3. **Lead database (Google Sheet)** — recommended: **Apps Script** (no Google Cloud project):
   1. Signed in as `sales@shivacha.com`, create a Google Sheet (or import `docs/shivacha-leads-template.xlsx`).
   2. *Extensions → Apps Script*, replace `Code.gs` with `docs/google-apps-script/leads.gs`, set `SECRET` to a long random string, *Save*, run `setup` once and allow access.
   3. *Deploy → New deployment → Web app*, *Execute as: Me*, *Who has access: Anyone* → copy the `/exec` URL.
   4. On the server set `GOOGLE_SHEETS_WEBHOOK_URL` (the URL) and `GOOGLE_SHEETS_WEBHOOK_SECRET` (the same secret). Requests without the secret are rejected.

   The sheet gets the header row, frozen columns and a **Lead Status** dropdown (New, Contacted, Qualified, Meeting, Proposal, Negotiation, Won, Lost, Nurture). If your sheet was created with the earlier statuses, paste the latest script and run `updateStatuses` once. Sales update *Assigned Sales Person*, *Notes*, *Last Contacted* and *Next Follow-up* directly in the sheet; the *View Lead* button in each notification opens the row. `npm run check:content` fails if the script's columns drift from `lib/leads/columns.ts`.
   - Alternative: Sheets API with a service account (`GOOGLE_SHEETS_LEADS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, then `npm run leads:setup-sheet`).
   - Self-hosted servers can use `LEAD_STORE=file` (JSON Lines, file mode 600, path `LEADS_FILE`, default `.data/leads.jsonl` — git-ignored). Serverless hosts need a Sheet.
4. Optional: `CRM_WEBHOOK_URL` / `CRM_WEBHOOK_SECRET` to forward every lead (HMAC-signed) to a CRM; `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` to add a CAPTCHA if spam appears.

**Reliability:** a lead is accepted when it is saved **or** the sales email is sent, so neither a mail outage nor a storage outage loses it; if both fail the visitor is asked to email sales@ or use WhatsApp. The visitor confirmation and webhook run after the response (`after()`).

**Lead score (0–100):** budget (up to 35), service (high-value services 15), work email (15), phone (10), company (10), description length (up to 15). engagement (return visit, 5+ pages, high-intent pages such as the estimator or hire pages, paid campaign; capped at 15). ≥70 Hot, ≥45 Warm, otherwise Nurture. Budgets never reject a lead. The same email or phone within 30 days is flagged as a possible duplicate in the email and Extra Details, never rejected.

**Attribution:** latest touch (UTM source/medium/campaign/term/content, landing page, referrer) plus first touch, device, visit count, pages viewed and high-intent pages are sent with every lead; the extra fields appear in *Extra Details* so sheet column positions are unchanged.

**Follow-up:** each lead gets *Next Follow-up* = next business day, 10:00 IST, stored with the lead and attached to the sales email as a calendar reminder (`.ics`).

### Security

- Server-side validation of every field (lengths, options, email syntax + mail-domain check, phone 7–15 digits with country code)
- Same-origin check using `Origin`, `Sec-Fetch-Site` and `Referer` (CSRF mitigation for this cookie-less endpoint)
- Honeypot field and minimum fill time; per-IP (8 / 10 min) and per-email (4 / 10 min) rate limits — in-memory, move to Redis/Upstash for multi-instance hosting
- Optional Cloudflare Turnstile; HTML-escaped email content; CR/LF stripped from subjects; spreadsheet values written as `RAW` and prefixed to prevent formula injection
- No secrets in the browser: only `NEXT_PUBLIC_CALENDLY_URL`, analytics IDs and the Turnstile site key are public; SMTP, OAuth and service-account credentials are read only on the server. Lead data is never returned by the API (it only returns a reference ID)

## Analytics

`components/layout/Analytics.tsx` loads GA4, Meta Pixel and LinkedIn Insight **only** when their IDs are configured. `lib/analytics.ts` pushes events to `dataLayer` (for GTM/CRM connectors) and each tool. Lead funnel: `form_start`, `form_step_complete` (step 1 / 2), `form_abandon` (with the step reached), `generate_lead` (successful submission — mark it as a GA4 key event), `calendly_click`, `calendly_booked` (from Calendly's embed messages), `whatsapp_click`, `cta_click`. Every lead event carries `lead_source`, `utm_medium`, `utm_campaign` and `landing_page` (captured first in `lib/attribution.ts`), so **conversion rate** = `generate_lead` ÷ `form_start` (or ÷ sessions) by source in GA4 explorations. Other events: `product_view`, `demo_click`, `demo_request`, `contact_submit`, `book_meeting`, `start_project`, `search`, `cta_click`, `whatsapp_click`, `email_click`, `phone_click`, `resource_request`, `newsletter_signup`, `job_apply` — with division, industry, budget and product properties where relevant. CTA clicks are tracked through `data-track` attributes via one delegated listener.

## Environment variables

See [`.env.example`](.env.example): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_LINKEDIN_PARTNER_ID`, `NEXT_PUBLIC_GSC_VERIFICATION`, `CRM_WEBHOOK_URL`, `CRM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.

## Content integrity rules (no fabricated claims)

The site deliberately publishes **no** client names, logos, testimonials, metrics, certifications, awards, partners or offices that are not verified. Trust sections render only when entries exist in `siteConfig.trust`. Specifically:

- Case studies are labelled **reference architectures** and say so on the page; add `kind: "client"` entries only with written client approval.
- Offices (Gurgaon HQ, Dallas, London) and enquiry desks are configured in `data/siteConfig.ts` (`offices`, `enquiries`) and power the footer, contact page, market pages and Organization JSON-LD. Publish an office phone only once confirmed.
- FinTech/Web3 pages position Shivacha as a technology provider; regulated activities are attributed to licensed partners, and card pages use "technology infrastructure for card-program integrations".
- Smart contract and security work is described as **audit-ready engineering**, never as independent audits or certifications.
- Product UI previews are rendered in code and captioned "Illustrative interface · sample data".
- Careers entries are open application tracks, not fabricated vacancies.

### Before launch — items that need owner input

1. **Founder & leadership:** only verified facts are published (name, role, LinkedIn). Add a fuller bio and other leaders in `data/leadership.ts`.
2. **Legal pages** (`data/legal.ts`) are plain-language templates and must be reviewed by counsel.
3. **Gated resources:** the pages describe each guide and capture requests; the downloadable PDFs themselves still need to be produced (or fulfilment wired into the CRM).
4. **Product screenshots / demo environments:** add real assets and demo URLs in `data/demoLinks.ts`.
5. **Trust signals:** add verified client logos, testimonials, certifications or metrics to `siteConfig.trust`.
6. **Contact details:** email and phone are taken from the current public site; confirm they are still correct.
