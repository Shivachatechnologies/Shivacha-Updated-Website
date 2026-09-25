import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://snap.licdn.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.facebook.com https://px.ads.linkedin.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com",
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
    ];
  },
};

export default nextConfig;
