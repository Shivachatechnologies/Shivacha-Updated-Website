export const KB_CATEGORIES = ["WEB3", "FINTECH", "DIGITAL_ASSETS", "AI", "CLOUD", "COMPANY", "PRODUCTS", "SERVICES", "SUPPORT"] as const;
export const KB_CATEGORY_LABEL: Record<(typeof KB_CATEGORIES)[number], string> = { WEB3: "Web3", FINTECH: "FinTech", DIGITAL_ASSETS: "Digital assets", AI: "AI", CLOUD: "Cloud", COMPANY: "Company", PRODUCTS: "Products", SERVICES: "Services", SUPPORT: "Support" };
export const KB_VISIBILITY_HELP = { INTERNAL: "Staff only", CLIENT: "Staff and client portal users", PUBLIC: "Everyone — published at /help" } as const;
