export type LlmCredential = {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly proxyUrl?: string;
  readonly pricingMultiplier?: number;
};

export interface CredentialResolver {
  resolve(credentialRef: string, signal: AbortSignal): Promise<LlmCredential>;
}
