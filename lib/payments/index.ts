import "server-only";
import { stripeProvider } from "./stripe";
import { razorpayProvider } from "./razorpay";
import type { PaymentProvider } from "./types";

export const PAYMENT_PROVIDERS: PaymentProvider[] = [stripeProvider, razorpayProvider];
export const getProvider = (key: string) => PAYMENT_PROVIDERS.find((p) => p.key === key) ?? null;
/** INR invoices prefer Razorpay, everything else Stripe — whichever is configured. */
export const providerFor = (currency: string) => {
  const order = currency === "INR" ? [razorpayProvider, stripeProvider] : [stripeProvider, razorpayProvider];
  return order.find((p) => p.isConfigured()) ?? null;
};
