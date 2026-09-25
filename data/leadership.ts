import type { Leader } from "./types";

/** Only verified information is published. Add team members here as their details are confirmed. */
export const leadership: Leader[] = [
  {
    slug: "chandrakant-singh",
    name: "Chandrakant Singh",
    role: "CEO & Founder",
    bio: [
      "Chandrakant Singh founded Shivacha Technologies and leads the company as Chief Executive Officer.",
      "He sets Shivacha's direction as a technology company spanning AI, digital engineering, fintech, Web3 and cloud, and works directly with clients on their most important technology initiatives.",
    ],
    linkedin: "https://www.linkedin.com/in/chandrakantr62/",
    verified: true,
  },
];

export const founder = leadership[0];
