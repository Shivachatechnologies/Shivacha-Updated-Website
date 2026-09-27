import "server-only";
import type { PaymentProvider } from "./types";
import { verifyRazorpaySignature } from "./signature";

const API = "https://api.razorpay.com/v1";

async function rzp<T>(path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay: ${json.error?.description ?? res.status}`);
  return json;
}

export const razorpayProvider: PaymentProvider = {
  key: "RAZORPAY",
  name: "Razorpay",
  env: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  isConfigured: () => !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET && !!process.env.RAZORPAY_WEBHOOK_SECRET,
  async createPaymentLink(i) {
    const r = await rzp<{ id: string; short_url: string }>("/payment_links", { amount: i.amountMinor, currency: i.currency, description: i.description.slice(0, 2048), reference_id: i.invoiceNumber, customer: i.customerEmail ? { email: i.customerEmail } : undefined, notify: { email: false, sms: false }, notes: { invoiceId: i.invoiceId } });
    return { url: r.short_url, ref: r.id };
  },
  async verifyWebhook(raw, headers) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !verifyRazorpaySignature(raw, headers.get("x-razorpay-signature"), secret)) return { valid: false, event: null };
    const evt = JSON.parse(raw) as { event: string; payload: { payment?: { entity: { id: string; amount: number; currency: string; status: string; method?: string } }; payment_link?: { entity: { id: string; notes?: Record<string, string> } } } };
    if (evt.event !== "payment_link.paid") return { valid: true, event: null };
    const pay = evt.payload.payment?.entity;
    const link = evt.payload.payment_link?.entity;
    if (!pay || pay.status !== "captured") return { valid: true, event: null };
    return { valid: true, event: { paymentRef: pay.id, linkRef: link?.id ?? null, invoiceId: link?.notes?.invoiceId ?? null, amountMinor: pay.amount, currency: pay.currency.toUpperCase(), method: pay.method === "upi" ? "UPI" : pay.method === "card" ? "CARD" : pay.method === "netbanking" ? "BANK_TRANSFER" : "OTHER" } };
  },
  async refund(paymentRef, amountMinor) {
    const r = await rzp<{ id: string }>(`/payments/${encodeURIComponent(paymentRef)}/refund`, { amount: amountMinor });
    return { ref: r.id };
  },
};
