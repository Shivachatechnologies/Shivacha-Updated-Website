/**
 * Payment provider abstraction. A payment is only ever marked CONFIRMED from
 * (a) a provider webhook whose signature has been verified, or (b) a finance manager confirming a manual receipt.
 */
export interface PaymentLinkInput {
  invoiceId: string;
  invoiceNumber: string;
  /** Amount in minor units (cents/paise). */
  amountMinor: number;
  currency: string;
  customerEmail?: string | null;
  description: string;
}

export interface VerifiedPaymentEvent {
  /** Provider's payment id (idempotency key). */
  paymentRef: string;
  /** Payment link / checkout reference used to find the invoice. */
  linkRef?: string | null;
  invoiceId?: string | null;
  amountMinor: number;
  currency: string;
  method: "CARD" | "UPI" | "BANK_TRANSFER" | "OTHER";
}

export interface PaymentProvider {
  key: "STRIPE" | "RAZORPAY";
  name: string;
  /** Required environment variables (names only; values are never displayed). */
  env: string[];
  isConfigured(): boolean;
  createPaymentLink(input: PaymentLinkInput): Promise<{ url: string; ref: string }>;
  /** Verifies the webhook signature and returns a successful payment event, or null (ignored / invalid). */
  verifyWebhook(rawBody: string, headers: Headers): Promise<{ valid: boolean; event: VerifiedPaymentEvent | null }>;
  refund(paymentRef: string, amountMinor: number): Promise<{ ref: string }>;
}

export const toMinor = (amount: string) => {
  const [i, f = ""] = amount.split(".");
  return Number(i) * 100 + Number((f + "00").slice(0, 2));
};
export const fromMinor = (minor: number) => (minor / 100).toFixed(2);
