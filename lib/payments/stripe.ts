import "server-only";
import { siteConfig } from "@/data/siteConfig";
import type { PaymentProvider } from "./types";
import { verifyStripeSignature } from "./signature";

const API = "https://api.stripe.com/v1";

async function stripe<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`);
  return json;
}

export const stripeProvider: PaymentProvider = {
  key: "STRIPE",
  name: "Stripe",
  env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  isConfigured: () => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET,
  async createPaymentLink(i) {
    const price = await stripe<{ id: string }>("/prices", { currency: i.currency.toLowerCase(), unit_amount: String(i.amountMinor), "product_data[name]": `${siteConfig.name} — Invoice ${i.invoiceNumber}` });
    const link = await stripe<{ id: string; url: string }>("/payment_links", {
      "line_items[0][price]": price.id,
      "line_items[0][quantity]": "1",
      "metadata[invoiceId]": i.invoiceId,
      "payment_intent_data[metadata][invoiceId]": i.invoiceId,
      "restrictions[completed_sessions][limit]": "1",
      "after_completion[type]": "hosted_confirmation",
      "after_completion[hosted_confirmation][custom_message]": "Thank you. Your payment is being confirmed and will appear in your client portal shortly.",
    });
    return { url: link.url, ref: link.id };
  },
  async verifyWebhook(raw, headers) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !verifyStripeSignature(raw, headers.get("stripe-signature"), secret)) return { valid: false, event: null };
    const evt = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
    if (evt.type !== "checkout.session.completed" && evt.type !== "checkout.session.async_payment_succeeded") return { valid: true, event: null };
    const s = evt.data.object as { payment_status?: string; payment_intent?: string; payment_link?: string; amount_total?: number; currency?: string; metadata?: Record<string, string> };
    if (s.payment_status !== "paid" || !s.payment_intent || typeof s.amount_total !== "number" || !s.currency) return { valid: true, event: null };
    return { valid: true, event: { paymentRef: s.payment_intent, linkRef: s.payment_link ?? null, invoiceId: s.metadata?.invoiceId ?? null, amountMinor: s.amount_total, currency: s.currency.toUpperCase(), method: "CARD" } };
  },
  async refund(paymentRef, amountMinor) {
    const r = await stripe<{ id: string }>("/refunds", { payment_intent: paymentRef, amount: String(amountMinor) });
    return { ref: r.id };
  },
};
