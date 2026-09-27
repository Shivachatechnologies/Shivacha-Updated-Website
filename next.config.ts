import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://snap.licdn.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.facebook.com https://px.ads.linkedin.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com https://calendly.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const commercialRedirects: [string, string][] = [
  ...[
    "blockchain-development",
    "web3-development",
    "smart-contract-development",
    "defi-development",
    "token-development",
    "crypto-exchange-development",
    "crypto-wallet-development",
    "fintech-development",
    "neobank-development",
    "ai-development",
    "saas-development",
    "mobile-app-development",
    "web-development",
    "mvp-development",
  ].map((s): [string, string] => [s, s]),
  ["payment-solutions", "payment-platform-development"],
  ["ai-agent-development", "ai-agents"],
  ["enterprise-software-development", "enterprise-software"],
  ["crypto-payment-gateway-development", "crypto-payment-gateway"],
  ["stablecoin-development", "stablecoin-platform-development"],
  ["digital-asset-platform-development", "digital-asset-platform"],
  ["p2p-crypto-exchange-development", "p2p-exchange-development"],
  ["digital-banking-development", "digital-banking-development"],
];

/** White-label keyword URLs → the canonical product page (one page per product, no duplicates). */
const whiteLabelRedirects: [string, string][] = [
  ["white-label-crypto-exchange", "crypto-exchange"],
  ["white-label-crypto-exchange-development", "crypto-exchange"],
  ["white-label-crypto-wallet", "crypto-wallet"],
  ["white-label-neobank", "neobank"],
  ["crypto-card-development", "crypto-card"],
  ["crypto-card-platform", "crypto-card"],
  ["rwa-tokenization-platform", "rwa-platform"],
  ["white-label-p2p-exchange", "p2p-trading-platform"],
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/search-index.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
  async redirects() {
    // Legacy URLs from the previous shivacha.com site.
    return [
      { source: "/about", destination: "/company/about", permanent: true },
      { source: "/team", destination: "/company/leadership", permanent: true },
      { source: "/why-us", destination: "/company/engineering", permanent: true },
      { source: "/hire-us", destination: "/hire-developers", permanent: true },
      { source: "/solutions/blockchain", destination: "/capabilities/web3", permanent: true },
      { source: "/nginx", destination: "/technologies/nginx", permanent: true },
      { source: "/linux", destination: "/technologies/linux", permanent: true },
      { source: "/south-africa", destination: "/markets/south-africa", permanent: true },
      { source: "/company/contact", destination: "/contact", permanent: false },
      // Short commercial URLs → canonical /services/* pages (existing URL architecture).
      ...commercialRedirects.map(([from, to]) => ({ source: `/${from}`, destination: `/services/${to}`, permanent: true })),
      ...whiteLabelRedirects.map(([from, to]) => ({ source: `/${from}`, destination: `/products/${to}`, permanent: true })),
      { source: "/dedicated-development-team", destination: "/dedicated-teams", permanent: true },
      { source: "/partners", destination: "/company/partners", permanent: true },
    ];
  },
};

export default nextConfig;
