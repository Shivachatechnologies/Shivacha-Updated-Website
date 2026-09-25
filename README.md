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

The official logo lives in [`public/brand`](public/brand): the original files (`shivacha-mark-original.jpg`, `shivacha-logo-original.png`) plus vector versions traced from them — `shivacha-mark.svg`, `shivacha-wordmark.svg` (white, for dark backgrounds), `shivacha-logo.svg` (full lockup, white text) and `shivacha-logo-dark.svg` (dark text, for light backgrounds). Brand blue is `#0195FF`. The header/footer logo (`components/layout/Logo.tsx`), favicon (`app/icon.svg`), Apple touch icon and Open Graph image all use these paths (`lib/brand/*`).

## Content model

All content types are defined in [`data/types.ts`](data/types.ts). Highlights:

- **Divisions** (`data/capabilities.ts`) — the five divisions, their tagline, colour token and context-specific CTA (e.g. *Discuss Your Financial Platform*).
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

## Forms, security and lead routing

All forms post to `/api/lead` (`app/api/lead/route.ts`):

- Shared client/server validation (`lib/validation.ts`), sanitisation and length limits
- Same-origin check (CSRF mitigation), honeypot field and minimum fill-time check
- Per-IP rate limiting (in-memory — replace with Redis/Upstash for multi-instance hosting)
- Upload allow-list (PDF, Office, TXT, PNG, JPG; max 5 files / 10 MB)
- Optional Cloudflare Turnstile (CAPTCHA readiness) — enabled when both Turnstile env vars are set
- Leads are forwarded as JSON to `CRM_WEBHOOK_URL`, signed with HMAC-SHA256 (`x-shivacha-signature`) when `CRM_WEBHOOK_SECRET` is set. Without a webhook, submissions are only logged (field names, not values).

Security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP) are set in `next.config.ts`. No secrets are exposed to the browser; only `NEXT_PUBLIC_*` IDs are public.

## Analytics

`components/layout/Analytics.tsx` loads GA4, Meta Pixel and LinkedIn Insight **only** when their IDs are configured. `lib/analytics.ts` pushes events to `dataLayer` (for GTM/CRM connectors) and each tool: `product_view`, `demo_click`, `demo_request`, `contact_submit`, `book_meeting`, `start_project`, `search`, `cta_click`, `whatsapp_click`, `email_click`, `phone_click`, `resource_request`, `newsletter_signup`, `job_apply` — with division, industry, budget and product properties where relevant. CTA clicks are tracked through `data-track` attributes via one delegated listener.

## Environment variables

See [`.env.example`](.env.example): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_LINKEDIN_PARTNER_ID`, `NEXT_PUBLIC_GSC_VERIFICATION`, `CRM_WEBHOOK_URL`, `CRM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.

## Content integrity rules (no fabricated claims)

The site deliberately publishes **no** client names, logos, testimonials, metrics, certifications, awards, partners or offices that are not verified. Trust sections render only when entries exist in `siteConfig.trust`. Specifically:

- Case studies are labelled **reference architectures** and say so on the page; add `kind: "client"` entries only with written client approval.
- Market pages describe remote delivery and state that no local office is claimed.
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
