import { stripeProvider } from "@/lib/payments/stripe";
import { recordProviderPayment } from "@/lib/finance/provider-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe webhook. The raw body is signature-verified before anything is recorded; unsigned requests are rejected. */
export async function POST(req: Request) {
  if (!stripeProvider.isConfigured()) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
  const { valid, event } = await stripeProvider.verifyWebhook(raw, req.headers);
  if (!valid) return new Response("Invalid signature", { status: 400 });
  if (!event) return Response.json({ received: true, ignored: true });
  try {
    const r = await recordProviderPayment(stripeProvider, event);
    return Response.json({ received: true, status: r.status });
  } catch (e) {
    console.error("[webhook:stripe] failed", (e as Error).message);
    // 500 lets the provider retry; processing is idempotent.
    return new Response("Processing failed", { status: 500 });
  }
}
