import { prepareImageMessages } from "./image-messages.js";
import { validateDeepSeekImage, validateDeepSeekImageMessages, validateDeepSeekPayload } from "./deepseek-images.js";
import { LegacyProxyWireEngine } from "./legacy-proxy-wire-engine.js";
import { catalogProviderForEndpoint, type ModelPricingSnapshot } from "@actspace/shared";
import { calculateUsageCost } from "@actspace/llm-service";
import { reasoningPayload } from "./reasoning-options.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";
import { LlmRuntimeError, providerCodeFromUnknown, retryAfterMsFromUnknown, type LlmFailure, type LlmFailureKind } from "@actspace/llm-service";
import type { LlmContentBlock, LlmMessage } from "@actspace/llm-service";
import type { PiAiEngine } from "./pi-ai-adapter.js";
import { redactLlmText } from "@actspace/llm-service";
import type { LlmStreamEvent, LlmStreamSource } from "@actspace/llm-service";
import type { LlmUsage } from "@actspace/llm-service";

export type PiAiWireRoute = "openai-completions" | "openai-responses" | "anthropic-messages";
export type PiAiArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly data: Uint8Array; readonly mimeType: string }>;
export type PiAiWireEngineOptions = {
  readonly modelFacts?: { readonly contextWindow: number | null; readonly maxTokens: number | null; readonly input: readonly ("text" | "image")[]; readonly reasoning: boolean };
  readonly pricing?: ModelPricingSnapshot | null;
  readonly route: PiAiWireRoute;
  readonly providerId: string;
  readonly modelId?: string;
  readonly baseUrl?: string;
  readonly readArtifact?: PiAiArtifactReader;
  readonly load?: PiAiPublicLoader;
};

type PiAiPublicLoader = (route: PiAiWireRoute) => Promise<{ readonly core: PiAiCoreModule; readonly api: PiAiApiModule }>;
type PiAiCoreModule = {
  createModels(): PiAiModels;
  createProvider(input: RuntimeV2JsonValue): PiAiProvider;
};
type PiAiApiModule = { readonly stream: Function; readonly streamSimple: Function };
type PiAiProvider = { readonly id: string };
type PiAiModels = { setProvider(provider: PiAiProvider): void; getModel(provider: string, model: string): PiAiModel | undefined; streamSimple(model: PiAiModel, context: PiAiContext, options: RuntimeV2JsonValue): AsyncIterable<PiAiEvent> };
type PiAiModel = { readonly id: string; readonly provider: string };
type PiAiContext = { readonly systemPrompt?: string; readonly messages: readonly RuntimeV2JsonValue[]; readonly tools?: readonly RuntimeV2JsonValue[] };
type PiAiUsage = { readonly input?: number; readonly output?: number; readonly cacheRead?: number; readonly cacheWrite?: number; readonly reasoning?: number; readonly cost?: { readonly total?: number } };
type PiAiAssistant = { readonly content: readonly RuntimeV2JsonValue[]; readonly stopReason: string; readonly errorMessage?: string; readonly usage?: PiAiUsage; readonly status?: number; readonly code?: string; readonly retryAfterMs?: number };
type PiAiEvent = { readonly type: string; readonly contentIndex?: number; readonly delta?: string; readonly content?: string; readonly toolCall?: { readonly id: string; readonly name: string; readonly arguments: RuntimeV2JsonValue }; readonly partial?: PiAiAssistant; readonly message?: PiAiAssistant; readonly error?: PiAiAssistant };

export class PiAiWireEngine implements PiAiEngine {
  readonly #load: PiAiPublicLoader;
  constructor(private readonly options: PiAiWireEngineOptions) { this.#load = options.load ?? loadPiAiPublicModules; }

  async stream(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> {
    if (input.credential.proxyUrl === undefined && catalogProviderForEndpoint(input.credential.baseUrl ?? this.options.baseUrl ?? "") === "openrouter" && this.options.route !== "anthropic-messages") {
      return new LegacyProxyWireEngine(this.options).stream(input);
    }
    if (input.credential.proxyUrl !== undefined) throw failure("proxy", "pi-ai 0.82.1 has no accepted request-scoped proxy injection for this route.");
    try {
      const { core, api } = await this.#load(this.options.route);
      if (typeof core.createModels !== "function" || typeof core.createProvider !== "function" || typeof api.streamSimple !== "function") throw failure("unsupported-capability", "pi-ai public stream exports are unavailable.");
      const baseUrl = input.credential.baseUrl ?? this.options.baseUrl;
      if (baseUrl === undefined) throw failure("invalid-request", `No base URL is configured for pi-ai route ${input.request.routeId}.`);
      const modelId = this.options.modelId ?? input.request.model;
      const model = createModel(this.options, modelId, baseUrl);
      const provider = core.createProvider({ id: this.options.providerId, name: this.options.providerId, baseUrl, auth: { apiKey: { name: "ActSpace credential", resolve: async () => ({ auth: input.credential.apiKey === undefined ? {} : { apiKey: input.credential.apiKey }, source: "ActSpace credential" }) } }, models: [model], api } as never);
      const models = core.createModels(); models.setProvider(provider);
      const resolved = models.getModel(this.options.providerId, modelId);
      if (resolved === undefined) throw failure("invalid-request", `pi-ai did not publish model ${modelId}.`);
      const deepseek = this.options.providerId === "deepseek" && this.options.route === "openai-completions";
      const messages = prepareImageMessages(input.request.messages, this.options.modelFacts?.input.includes("image") ?? true, this.options.route === "anthropic-messages");
      if (deepseek) validateDeepSeekImageMessages(messages, this.options.modelFacts?.input.includes("image") ?? true);
      const readArtifact = this.options.readArtifact;
      const checkedReader: PiAiArtifactReader | undefined = deepseek && readArtifact ? async (sessionId, artifactId) => {
        const artifact = await readArtifact(sessionId, artifactId);
        return { ...artifact, mimeType: validateDeepSeekImage(artifact.data) };
      } : readArtifact;
      const context = await toPiAiContext(messages, input.request.tools, input.request.sessionId, checkedReader, deepseek ? { api: this.options.route, provider: this.options.providerId, model: modelId } : undefined);
      const events = models.streamSimple(resolved, context, { apiKey: input.credential.apiKey, signal: input.signal, maxRetries: 0, maxRetryDelayMs: 0, temperature: input.request.options.temperature, maxTokens: input.request.options.maxTokens ?? Math.min(32_768, this.options.modelFacts?.maxTokens ?? 32_768), reasoning: input.request.options.reasoning === false ? undefined : input.request.options.reasoningEffort === "ultra" ? "max" : input.request.options.reasoningEffort ?? (input.request.options.reasoning ? "high" : undefined), onPayload: (payload: Record<string, unknown>) => { const body = { ...payload, ...reasoningPayload(this.options.route, this.options.providerId, input.request.options) }; if (deepseek) validateDeepSeekPayload(body); return body; }, headers: input.credential.headers } as never);
      return fromPiAiEvents(events, input.request.requestId, this.options.pricing ?? null);
    } catch (error) {
      if (error instanceof LlmRuntimeError) throw error;
      throw new LlmRuntimeError(classifyFailure(error), error);
    }
  }
}

async function loadPiAiPublicModules(route: PiAiWireRoute): Promise<{ readonly core: PiAiCoreModule; readonly api: PiAiApiModule }> {
  const packageName: string = "@earendil-works/pi-ai";
  const routeModule: string = `${packageName}/api/${route}`;
  const [core, api] = await Promise.all([import(packageName), import(routeModule)]);
  return { core: core as unknown as PiAiCoreModule, api: api as unknown as PiAiApiModule };
}

function createModel(options: PiAiWireEngineOptions, model: string, baseUrl: string): RuntimeV2JsonValue {
  return { id: model, name: model, api: options.route, provider: options.providerId, baseUrl, ...(options.providerId === "deepseek" && options.route === "openai-completions" ? { compat: { maxTokensField: "max_tokens" } } : {}), reasoning: options.modelFacts?.reasoning ?? true, input: options.modelFacts ? [...options.modelFacts.input] : ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: options.modelFacts?.contextWindow ?? 262_144, maxTokens: options.modelFacts?.maxTokens ?? 32_768 };
}

async function toPiAiContext(messages: readonly LlmMessage[], tools: readonly { readonly name: string; readonly description: string; readonly inputSchema: RuntimeV2JsonValue }[], sessionId?: string, readArtifact?: PiAiArtifactReader, replay?: { api: string; provider: string; model: string }): Promise<PiAiContext> {
  const systemPrompt = messages.filter((message) => message.role === "system").map(messageText).join("\n\n");
  const names = new Map<string, string>(); const output: RuntimeV2JsonValue[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "assistant") {
      const content = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content.map((block) => toPiAssistantBlock(block, names, Boolean(replay)));
      output.push({ role: "assistant", content, api: replay?.api ?? "replay", provider: replay?.provider ?? "actspace", model: replay?.model ?? "replay", usage: zeroUsage(), stopReason: content.some((block) => typeof block === "object" && block !== null && (block as { type?: string }).type === "toolCall") ? "toolUse" : "stop", timestamp: 0 });
      continue;
    }
    if (message.role === "tool") {
      output.push({ role: "toolResult", toolCallId: message.callId ?? "unknown", toolName: names.get(message.callId ?? "") ?? "unknown", content: await toPiUserContent({ ...message, content: typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content }, sessionId, readArtifact), isError: false, timestamp: 0 });
      continue;
    }
    output.push({ role: "user", content: await toPiUserContent(message, sessionId, readArtifact), timestamp: 0 });
  }
  return { ...(systemPrompt ? { systemPrompt } : {}), messages: output, ...(tools.length > 0 ? { tools: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) } : {}) };
}

function toPiAssistantBlock(block: LlmContentBlock, names: Map<string, string>, deepseek = false): RuntimeV2JsonValue {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.type === "reasoning") return { type: "thinking", thinking: block.text, ...(deepseek ? { thinkingSignature: "reasoning_content" } : block.signature ? { thinkingSignature: block.signature } : {}) };
  if (block.type === "tool-call") { names.set(block.callId, block.name); return { type: "toolCall", id: block.callId, name: block.name, arguments: parseArguments(block.arguments) }; }
  if (block.type === "tool-result") return { type: "text", text: block.content };
  return { type: "text", text: block.alt ?? `[image:${block.artifactId}]` };
}

async function toPiUserContent(message: LlmMessage, sessionId?: string, readArtifact?: PiAiArtifactReader): Promise<RuntimeV2JsonValue> {
  if (typeof message.content === "string") return message.content;
  const content: RuntimeV2JsonValue[] = [];
  for (const block of message.content) {
    if (block.type === "text") content.push({ type: "text", text: block.text });
    else if (block.type === "image") { if (readArtifact === undefined || sessionId === undefined) throw failure("unsupported-capability", "Image input requires a Session-bound ActSpace artifact reader."); const artifact = await readArtifact(sessionId, block.artifactId); content.push({ type: "image", data: Buffer.from(artifact.data).toString("base64"), mimeType: artifact.mimeType }); }
    else content.push({ type: "text", text: block.type === "tool-result" ? block.content : JSON.stringify(block) });
  }
  return content;
}

async function* fromPiAiEvents(events: AsyncIterable<PiAiEvent>, requestId: string, pricing: ModelPricingSnapshot | null): AsyncGenerator<LlmStreamEvent> {
  const calls = new Map<number, { callId: string; name: string }>();
  for await (const event of events) {
    if (event.type === "text_delta") yield { type: "text-delta", text: event.delta ?? "" };
    else if (event.type === "thinking_delta") yield { type: "reasoning-delta", text: event.delta ?? "" };
    else if (event.type === "toolcall_start") { const block = event.partial?.content[event.contentIndex ?? -1] as { id?: string; name?: string } | undefined; calls.set(event.contentIndex ?? -1, { callId: block?.id ?? `${requestId}:${event.contentIndex ?? 0}`, name: block?.name ?? "unknown" }); }
    else if (event.type === "toolcall_delta") { const call = calls.get(event.contentIndex ?? -1) ?? { callId: `${requestId}:${event.contentIndex ?? 0}`, name: "unknown" }; yield { type: "tool-call-delta", callId: call.callId, name: call.name, argumentsDelta: event.delta ?? "" }; }
    else if (event.type === "done" && event.message !== undefined) { yield { type: "done", stopReason: mapStopReason(event.message.stopReason), usage: calculateUsageCost(mapUsage(event.message.usage), pricing), content: toActSpaceContent(event.message.content) }; return; }
    else if (event.type === "error") { const terminal = event.error; if (terminal?.stopReason === "aborted") yield { type: "aborted", usage: calculateUsageCost(mapUsage(terminal.usage), pricing), reason: terminal.errorMessage ?? "pi-ai request aborted" }; else yield { type: "error", usage: calculateUsageCost(mapUsage(terminal?.usage), pricing), failure: classifyFailure(terminal ?? new Error("pi-ai stream failed")) }; return; }
  }
  yield { type: "error", failure: { kind: "malformed-stream", message: "pi-ai stream ended without a terminal event.", retryable: false, attempt: 1 } };
}

function toActSpaceContent(content: readonly RuntimeV2JsonValue[]): readonly LlmContentBlock[] { return content.flatMap((raw): LlmContentBlock[] => { const block = raw as { type?: string; text?: string; thinking?: string; thinkingSignature?: string; id?: string; name?: string; arguments?: RuntimeV2JsonValue }; if (block.type === "text") return [{ type: "text", text: block.text ?? "" }]; if (block.type === "thinking") return [{ type: "reasoning", text: block.thinking ?? "", ...(block.thinkingSignature ? { signature: block.thinkingSignature } : {}) }]; if (block.type === "toolCall") return [{ type: "tool-call", callId: block.id ?? "unknown", name: block.name ?? "unknown", arguments: JSON.stringify(block.arguments ?? {}) }]; return []; }); }
function mapUsage(usage?: PiAiUsage): LlmUsage { return { inputTokens: usage?.input ?? null, outputTokens: usage?.output ?? null, cacheReadTokens: usage?.cacheRead ?? null, cacheWriteTokens: usage?.cacheWrite ?? null, reasoningTokens: usage?.reasoning ?? null, cost: null, costCurrency: null, source: usage === undefined ? "unknown" : "provider-reported" }; }
function zeroUsage() { return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }; }
function mapStopReason(reason: string): string { return reason === "toolUse" ? "tool-calls" : reason === "length" ? "max-tokens" : reason; }
function messageText(message: LlmMessage): string { if (typeof message.content === "string") return message.content; return message.content.map((block) => block.type === "text" ? block.text : block.type === "reasoning" ? block.text : block.type === "tool-result" ? block.content : "").join(""); }
function parseArguments(value: string): RuntimeV2JsonValue { try { return JSON.parse(value) as RuntimeV2JsonValue; } catch { return { $raw: value }; } }
function failure(kind: LlmFailureKind, message: string): LlmRuntimeError { return new LlmRuntimeError({ kind, message, retryable: false, attempt: 1 }); }
function classifyFailure(error: unknown): LlmFailure {
  const rawMessage = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && typeof (error as { errorMessage?: unknown }).errorMessage === "string"
      ? (error as { errorMessage: string }).errorMessage
      : String(error);
  const message = redactLlmText(rawMessage);
  const statusValue = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  const status = Number(statusValue ?? /\b(400|401|402|403|404|422|429|5\d\d)\b/.exec(message)?.[1]);
  const httpStatus = Number.isFinite(status) && status > 0 ? status : undefined;
  const providerCode = providerCodeFromUnknown(error);
  const contextOverflow = /context(?:_|\s|-)*(?:length|window)|too many tokens|maximum context/i.test(`${providerCode ?? ""} ${message}`);
  const kind: LlmFailureKind = contextOverflow
    ? "context-overflow"
    : httpStatus === 401
      ? "authentication"
      : httpStatus === 402
        ? "quota"
        : httpStatus === 403
          ? "permission"
          : httpStatus === 429
            ? "rate-limit"
            : httpStatus === 400 || httpStatus === 404 || httpStatus === 422
              ? "invalid-request"
              : httpStatus !== undefined
                ? "provider"
                : /abort/i.test(message)
                  ? "abort"
                  : /timeout/i.test(message)
                    ? "timeout"
                    : /proxy/i.test(message)
                      ? "proxy"
                      : /network|fetch|socket|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)
                        ? "network"
                        : "unknown";
  const retryAfterMs = retryAfterMsFromUnknown(error);
  return {
    kind,
    message,
    retryable: kind === "rate-limit" || kind === "provider" || kind === "network" || kind === "timeout",
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    ...(providerCode === undefined ? {} : { providerCode }),
    attempt: 1,
  };
}
