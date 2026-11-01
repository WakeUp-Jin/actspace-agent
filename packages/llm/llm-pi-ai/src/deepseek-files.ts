import { createHash } from "node:crypto";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DeepSeekFileUploadInput = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly sessionId: string;
  readonly artifactId: string;
  readonly bytes: Uint8Array;
  readonly mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  readonly filename?: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: FetchLike;
};

type CachedFile = { readonly fileId: string; readonly expiresAt: number };

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const DEFAULT_EXPIRY_SECONDS = 86_400;

/**
 * Session-local, credential-scoped cache for DeepSeek Files API IDs.
 * The remote ID is deliberately kept in memory only; Journal still stores the
 * local Session Artifact reference and can recover by uploading again.
 */
export class DeepSeekFileUploader {
  readonly #cache = new Map<string, CachedFile>();
  readonly #inFlight = new Map<string, Promise<string>>();

  async resolve(input: DeepSeekFileUploadInput): Promise<string> {
    if (input.apiKey.trim() === "") throw new Error("DeepSeek Files API requires an API key.");
    if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("DeepSeek Files API accepts files up to 64 MiB.");
    const key = cacheKey(input);
    const current = this.#cache.get(key);
    const now = Math.floor(Date.now() / 1_000);
    if (current && current.expiresAt > now + 30) return current.fileId;
    this.#cache.delete(key);
    const pending = this.#inFlight.get(key);
    if (pending) return pending;
    const upload = this.#upload(input, key);
    this.#inFlight.set(key, upload);
    try {
      return await upload;
    } finally {
      this.#inFlight.delete(key);
    }
  }

  clear(): void {
    this.#cache.clear();
    this.#inFlight.clear();
  }

  async #upload(input: DeepSeekFileUploadInput, key: string): Promise<string> {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const endpoint = filesEndpoint(input.baseUrl);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const form = new FormData();
        form.append("purpose", "user_data");
        form.append("expires_after[anchor]", "created_at");
        form.append("expires_after[seconds]", String(DEFAULT_EXPIRY_SECONDS));
        form.append("file", new Blob([Buffer.from(input.bytes)], { type: input.mimeType }), input.filename ?? filenameFor(input.artifactId, input.mimeType));
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${input.apiKey}`, Accept: "application/json" },
          body: form,
          signal: input.signal,
        });
        if (!response.ok) {
          lastError = new Error(`DeepSeek Files API returned HTTP ${response.status}.`);
          if (!retryableStatus(response.status)) break;
          continue;
        }
        const payload = await boundedJson(response);
        const fileId = typeof payload.id === "string" && /^file-api-[A-Za-z0-9_-]+$/.test(payload.id) ? payload.id : undefined;
        if (!fileId) throw new Error("DeepSeek Files API returned an invalid file id.");
        const createdAt = number(payload.created_at) ?? Math.floor(Date.now() / 1_000);
        const expiresAt = number(payload.expires_at) ?? createdAt + DEFAULT_EXPIRY_SECONDS;
        this.#cache.set(key, { fileId, expiresAt });
        return fileId;
      } catch (error) {
        lastError = error;
        if (input.signal?.aborted || !isRetryableError(error) || attempt === 1) break;
      }
    }
    throw new Error(lastError instanceof Error ? lastError.message : "DeepSeek image upload failed.");
  }
}

export function filesEndpoint(baseUrl: string): string {
  let base = baseUrl.replace(/\/+$/, "");
  for (let index = 0; index < 3; index += 1) base = base.replace(/\/(?:anthropic|beta|v1)$/i, "");
  return `${base}/files`;
}

function cacheKey(input: DeepSeekFileUploadInput): string {
  return createHash("sha256").update(`${input.baseUrl}\0${input.apiKey}\0${input.sessionId}\0${input.artifactId}\0`).update(input.bytes).digest("hex");
}

function filenameFor(artifactId: string, mimeType: string): string {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : mimeType === "image/gif" ? "gif" : "webp";
  return `${artifactId}.${extension}`;
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const text = (await response.text()).slice(0, MAX_RESPONSE_BYTES).trim();
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("DeepSeek Files API returned an invalid response.");
  return parsed as Record<string, unknown>;
}

function retryableStatus(status: number): boolean { return status === 408 || status === 429 || status >= 500; }
function isRetryableError(error: unknown): boolean { return !(error instanceof Error) || error.name !== "AbortError"; }
function number(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined; }
