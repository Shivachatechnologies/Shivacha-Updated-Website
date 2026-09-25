import { products } from "../data/products";
const s = new Set<string>(); for (const p of products) { if (s.has(p.slug)) console.log("dup", p.slug); s.add(p.slug); }
console.log("products", products.length);
for (const p of products) for (const r of p.relatedProducts) if (!s.has(r)) console.log("bad related", p.slug, r);
