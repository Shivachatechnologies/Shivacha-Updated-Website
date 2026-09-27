import "server-only";

/**
 * E-signature provider abstraction. No provider is bundled: signatures are only ever recorded from a verified provider
 * callback or from a countersigned document uploaded by staff. Nothing is simulated.
 *
 * To add a provider, implement ESignProvider (send the contract PDF, return the envelope id, verify the provider's
 * webhook signature and map its events to SignatureStatus) and register it below.
 */
export interface ESignSigner {
  name: string;
  email: string;
}
export interface ESignProvider {
  key: string;
  name: string;
  /** Environment variables the provider needs (names only — values are never displayed). */
  env: string[];
  isConfigured(): boolean;
  send(input: { contractId: string; title: string; pdf: Uint8Array; signers: ESignSigner[] }): Promise<{ envelopeId: string }>;
  /** Verifies a webhook request and returns the normalised event, or null when the signature is invalid. */
  verifyWebhook(req: Request, rawBody: string): Promise<{ envelopeId: string; status: "SIGNED" | "DECLINED" | "VOIDED"; signerEmail?: string; signedAt?: Date } | null>;
}

const notImplemented = (name: string) => async (): Promise<never> => {
  throw new Error(`${name} integration is configured but its adapter has not been implemented in this deployment.`);
};

/** Known providers. They report "not connected" until their credentials exist AND an adapter is implemented. */
export const ESIGN_PROVIDERS: ESignProvider[] = [
  { key: "docusign", name: "DocuSign", env: ["DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_PRIVATE_KEY", "DOCUSIGN_WEBHOOK_SECRET"], isConfigured: () => false, send: notImplemented("DocuSign"), verifyWebhook: async () => null },
  { key: "dropbox-sign", name: "Dropbox Sign", env: ["DROPBOX_SIGN_API_KEY", "DROPBOX_SIGN_WEBHOOK_SECRET"], isConfigured: () => false, send: notImplemented("Dropbox Sign"), verifyWebhook: async () => null },
];

export const activeESignProvider = () => ESIGN_PROVIDERS.find((p) => p.isConfigured()) ?? null;
