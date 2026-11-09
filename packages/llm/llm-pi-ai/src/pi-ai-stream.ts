import { prepareImageMessages } from "./image-messages.js";
import { validateDeepSeekImage, validateDeepSeekImageMessages, validateDeepSeekPayload } from "./deepseek-images.js";
import type { ModelPricingSnapshot } from "@actspace/shared";
import { calculateUsageCost } from "@actspace/llm-service";
import { withReasoningPayload, withoutReasoningPayload } from "./reasoning-options.js";
import { builtinChatModel, builtinProviderForBaseUrl, loadBuiltinProvider, type PiAiBuiltinLoader, type PiAiBuiltinProvider } from "./builtin-providers.js";
import { ProviderProxyError, type ProviderProxyPool } from "@actspace/llm-service";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";
import { LlmRuntimeError, providerCodeFromUnknown, retryAfterMsFromUnknown, type LlmFailure, type LlmFailureKind } from "@actspace/llm-service";
import type { LlmContentBlock, LlmMessage, LlmReplayEnvelope } from "@actspace/llm-service";
import { redactLlmText } from "@actspace/llm-service";
import { describeTransportFailure, transportCauseOf, transportKind } from "./transport-failure.js";
import type { LlmStreamEvent, LlmStreamSource } from "@actspace/llm-service";
import type { LlmUsage } from "@actspace/llm-service";
import type { DeepSeekFileUploader } from "./deepseek-files.js";

export type PiAiWireRoute = "openai-completions" | "openai-responses" | "anthropic-messages";
export type PiAiArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly data: Uint8Array; readonly mimeType: string }>;
export type PiAiConnectionOptions = {
  readonly modelFacts?: { readonly contextWindow: number | null; readonly maxTokens: number | null; readonly input: readonly ("text" | "image")[]; readonly reasoning: boolean };
  readonly pricing?: ModelPricingSnapshot | null;
  readonly route: PiAiWireRoute;
  readonly providerId: string;
  readonly modelId?: string;
  readonly baseUrl?: string;
  readonly readArtifact?: PiAiArtifactReader;
  readonly deepSeekFiles?: DeepSeekFileUploader;
  readonly load?: PiAiPublicLoader;
  readonly loadBuiltin?: PiAiBuiltinLoader;
  readonly proxies?: ProviderProxyPool;
  readonly cacheRetention?: "short" | "long" | "none";
};

type ProviderFetch = Awaited<ReturnType<ProviderProxyPool["getFetch"]>>;
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
type PiAiWireUsage = { readonly version: 1; readonly input: number | null; readonly output: number | null; readonly cacheRead: number | null; readonly cacheWrite: number | null; readonly reasoning: number | null };
type PiAiUsage = { readonly actspaceWireUsage?: PiAiWireUsage };
type PiAiAssistant = { readonly content: readonly RuntimeV2JsonValue[]; readonly stopReason: string; readonly errorMessage?: string; readonly usage?: PiAiUsage; readonly status?: number; readonly code?: string; readonly retryAfterMs?: number };
type PiAiEvent = { readonly type: string; readonly contentIndex?: number; readonly delta?: string; readonly content?: string; readonly toolCall?: { readonly id: string; readonly name: string; readonly arguments: RuntimeV2JsonValue }; readonly partial?: PiAiAssistant; readonly message?: PiAiAssistant; readonly error?: PiAiAssistant };

/** Private protocol implementation; backend selection belongs to PiAiAdapter. */
export async function streamPiAi(options: PiAiConnectionOptions, input: LlmAdapterDispatchInput): Promise<LlmStreamSource> {
    const proxyState = { failed: false };
    try {
      const { core, api } = await (options.load ?? loadPiAiPublicModules)(options.route);
      if (typeof core.createModels !== "function" || typeof core.createProvider !== "function" || typeof api.streamSimple !== "function") throw failure("unsupported-capability", "pi-ai public stream exports are unavailable.");
      const baseUrl = input.credential.baseUrl ?? options.baseUrl;
      if (baseUrl === undefined) throw failure("invalid-request", `No base URL is configured for pi-ai route ${input.request.routeId}.`);
      const modelId = options.modelId ?? input.request.model;
      const credentialAuth = { apiKey: { name: "ActSpace credential", resolve: async () => ({ auth: input.credential.apiKey === undefined ? {} : { apiKey: input.credential.apiKey }, source: "ActSpace credential" }) } };
      const builtinId = builtinProviderForBaseUrl(baseUrl);
      const builtin = builtinId === undefined ? undefined : await (options.loadBuiltin ?? loadBuiltinProvider)(builtinId);
      const target = builtin === undefined
        ? { providerId: options.providerId, model: createModel(options, modelId, baseUrl), api: options.route, input: options.modelFacts?.input ?? (["text", "image"] as const), known: false }
        : builtinTarget(builtin, options, modelId, baseUrl);
      const provider = builtin === undefined
        ? core.createProvider({ id: options.providerId, name: options.providerId, baseUrl, auth: credentialAuth, models: [target.model], api } as never)
        : { id: builtin.id, name: builtin.name, baseUrl, auth: credentialAuth, getModels: () => [target.model], stream: (model: unknown, context: unknown, streamOptions: unknown) => builtin.stream(model, context, streamOptions), streamSimple: (model: unknown, context: unknown, streamOptions: unknown) => builtin.streamSimple(model, context, streamOptions) };
      const models = core.createModels(); models.setProvider(provider as PiAiProvider);
      const resolved = models.getModel(target.providerId, modelId);
      if (resolved === undefined) throw failure("invalid-request", `pi-ai did not publish model ${modelId}.`);
      const wireApi = target.api;
      const supportsImage = target.input.includes("image");
      const deepseek = options.providerId === "deepseek" && wireApi === "openai-completions";
      const messages = prepareImageMessages(input.request.messages, supportsImage, wireApi === "anthropic-messages");
      if (deepseek) validateDeepSeekImageMessages(messages, supportsImage);
      const readArtifact = options.readArtifact;
      const checkedReader: PiAiArtifactReader | undefined = deepseek && readArtifact ? async (sessionId, artifactId) => {
        const artifact = await readArtifact(sessionId, artifactId);
        return { ...artifact, mimeType: validateDeepSeekImage(artifact.data) };
      } : readArtifact;
      const context = await toPiAiContext(
        messages,
        input.request.tools,
        input.request.sessionId,
        checkedReader,
        // pi-ai keeps thinking only when the history names the request's own provider, api and model.
        { api: wireApi, provider: target.providerId, model: modelId },
        { provider: options.providerId, protocol: wireApi, model: modelId },
      );
      const fetch = await proxyFetch(options, input, proxyState);
      const requestOptions = input.request.options;
      const reasoning = requestOptions.reasoning === false ? undefined : requestOptions.reasoningEffort === "ultra" ? "max" : requestOptions.reasoningEffort ?? (requestOptions.reasoning ? "high" : undefined);
      // pi-ai owns thinking fields only for models it knows; "auto" (nothing chosen) sends none of them.
      // Unknown ids, even on a built-in address, keep ActSpace's provider rules: pi-ai has no thinking map for them.
      const automaticReasoning = requestOptions.reasoning === undefined && requestOptions.reasoningEffort === undefined;
      const onPayload = (payload: Record<string, unknown>) => {
        const body = !target.known ? withReasoningPayload(payload, wireApi, options.providerId, requestOptions) : automaticReasoning ? withoutReasoningPayload(payload) : payload;
        if (deepseek) validateDeepSeekPayload(body);
        return body;
      };
      const events = models.streamSimple(resolved, context, { apiKey: input.credential.apiKey, signal: input.signal, maxRetries: 0, maxRetryDelayMs: 0, temperature: requestOptions.temperature, maxTokens: requestOptions.maxTokens ?? Math.min(32_768, options.modelFacts?.maxTokens ?? 32_768), reasoning, sessionId: input.request.sessionId, cacheRetention: options.cacheRetention, onPayload, headers: input.credential.headers, ...(fetch === undefined ? {} : { fetch }) } as never);
      return fromPiAiEvents(events, input.request.requestId, options.pricing ?? null, { providerId: options.providerId, protocol: wireApi, modelId, endpoint: baseUrl }, proxyState);
    } catch (error) {
      if (error instanceof LlmRuntimeError) throw error;
      throw new LlmRuntimeError(classifyFailure(error, input.credential.baseUrl ?? options.baseUrl, proxyState.failed), error);
    }
}

/**
 * A connection on a built-in provider's address: pi-ai's own model when it knows the id
 * (per-model api, address, thinking map and compat), otherwise the connection's protocol and address
 * with pi-ai's address-based compat detection.
 * Capacity facts prefer ActSpace settings; pricing never comes from pi-ai.
 */
function builtinTarget(builtin: PiAiBuiltinProvider, options: PiAiConnectionOptions, modelId: string, baseUrl: string): { providerId: string; model: RuntimeV2JsonValue; api: PiAiWireRoute; input: readonly string[]; known: boolean } {
  const known = builtinChatModel(builtin, modelId);
  const facts = options.modelFacts;
  if (known === undefined) {
    const model = { ...(createModel(options, modelId, baseUrl, false) as Record<string, RuntimeV2JsonValue>), provider: builtin.id };
    return { providerId: builtin.id, model, api: options.route, input: facts?.input ?? ["text", "image"], known: false };
  }
  const input = facts?.input ?? known.input ?? ["text", "image"];
  // Server-side fallbacks would answer with another model than the one priced and replayed for this request.
  const { allowedFallbackModels: _fallbacks, ...compat } = (known.compat ?? {}) as Record<string, unknown>;
  const model = {
    ...known,
    ...(known.compat === undefined ? {} : { compat }),
    provider: builtin.id,
    input: [...input],
    contextWindow: facts?.contextWindow ?? known.contextWindow ?? 262_144,
    maxTokens: facts?.maxTokens ?? known.maxTokens ?? 32_768,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  } as unknown as RuntimeV2JsonValue;
  return { providerId: builtin.id, model, api: known.api, input, known: true };
}

/** Request-scoped proxy transport; records proxy failures so the terminal error keeps its kind. */
async function proxyFetch(options: PiAiConnectionOptions, input: LlmAdapterDispatchInput, state: { failed: boolean }): Promise<ProviderFetch | undefined> {
  const proxyUrl = input.credential.proxyUrl;
  if (proxyUrl === undefined) return undefined;
  if (options.proxies === undefined) throw failure("invalid-request", "Missing request-scoped proxy pool.");
  let base: ProviderFetch;
  try { base = await options.proxies.getFetch(proxyUrl); } catch (error) { state.failed = true; throw error; }
  return async (url, init) => {
    try { return await base(url, init); } catch (error) {
      if (error instanceof ProviderProxyError) state.failed = true;
      throw error;
    }
  };
}

async function loadPiAiPublicModules(route: PiAiWireRoute): Promise<{ readonly core: PiAiCoreModule; readonly api: PiAiApiModule }> {
  const packageName: string = "@earendil-works/pi-ai";
  const routeModule: string = `${packageName}/api/${route}`;
  const [core, api] = await Promise.all([import(packageName), import(routeModule)]);
  return { core: core as unknown as PiAiCoreModule, api: api as unknown as PiAiApiModule };
}

function createModel(options: PiAiConnectionOptions, model: string, baseUrl: string, withCompat = true): RuntimeV2JsonValue {
  return { id: model, name: model, api: options.route, provider: options.providerId, baseUrl, ...(withCompat && options.providerId === "deepseek" && options.route === "openai-completions" ? { compat: { maxTokensField: "max_tokens" } } : {}), reasoning: options.modelFacts?.reasoning ?? true, input: options.modelFacts ? [...options.modelFacts.input] : ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: options.modelFacts?.contextWindow ?? 262_144, maxTokens: options.modelFacts?.maxTokens ?? 32_768 };
}

async function toPiAiContext(messages: readonly LlmMessage[], tools: readonly { readonly name: string; readonly description: string; readonly inputSchema: RuntimeV2JsonValue }[], sessionId?: string, readArtifact?: PiAiArtifactReader, replay?: { api: string; provider: string; model: string }, replayIdentity?: { provider: string; protocol: string; model: string }): Promise<PiAiContext> {
  const systemPrompt = messages.filter((message) => message.role === "system").map(messageText).join("\n\n");
  const names = new Map<string, string>(); const output: RuntimeV2JsonValue[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "assistant") {
      const content = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content.map((block) => toPiAssistantBlock(block, names, replayIdentity?.provider === "deepseek" && replayIdentity.protocol === "openai-completions", replayIdentity));
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

function toPiAssistantBlock(block: LlmContentBlock, names: Map<string, string>, deepseek = false, replayIdentity?: { provider: string; protocol: string; model: string }): RuntimeV2JsonValue {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.type === "reasoning") {
    const replayCompatible = replayIdentity !== undefined && block.replay?.schemaVersion === 1 && block.replay.adapterFamily === "pi-ai" && block.replay.providerId === replayIdentity.provider && block.replay.protocol === replayIdentity.protocol && block.replay.modelId === replayIdentity.model;
    const replaySignature = replayCompatible && block.replay?.payload !== null && typeof block.replay?.payload === "object" && !Array.isArray(block.replay.payload) && typeof (block.replay.payload as { thinkingSignature?: unknown }).thinkingSignature === "string"
      ? (block.replay.payload as { thinkingSignature: string }).thinkingSignature
      : undefined;
    return { type: "thinking", thinking: block.text, ...(deepseek ? { thinkingSignature: "reasoning_content" } : block.replay === undefined && block.signature ? { thinkingSignature: block.signature } : replaySignature ? { thinkingSignature: replaySignature } : {}) };
  }
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

async function* fromPiAiEvents(events: AsyncIterable<PiAiEvent>, requestId: string, pricing: ModelPricingSnapshot | null, identity: { readonly providerId: string; readonly protocol: string; readonly modelId: string; readonly endpoint?: string }, proxyState: { readonly failed: boolean }): AsyncGenerator<LlmStreamEvent> {
  const calls = new Map<number, { callId: string; name: string }>();
  for await (const event of events) {
    if (event.type === "text_delta") yield { type: "text-delta", text: event.delta ?? "" };
    else if (event.type === "thinking_delta") yield { type: "reasoning-delta", text: event.delta ?? "" };
    else if (event.type === "toolcall_start") { const block = event.partial?.content[event.contentIndex ?? -1] as { id?: string; name?: string } | undefined; calls.set(event.contentIndex ?? -1, { callId: block?.id ?? `${requestId}:${event.contentIndex ?? 0}`, name: block?.name ?? "unknown" }); }
    else if (event.type === "toolcall_delta") { const call = calls.get(event.contentIndex ?? -1) ?? { callId: `${requestId}:${event.contentIndex ?? 0}`, name: "unknown" }; yield { type: "tool-call-delta", callId: call.callId, name: call.name, argumentsDelta: event.delta ?? "" }; }
    else if (event.type === "done" && event.message !== undefined) { yield { type: "done", stopReason: mapStopReason(event.message.stopReason), usage: calculateUsageCost(mapUsage(event.message.usage, identity.protocol), pricing), content: toActSpaceContent(event.message.content, identity) }; return; }
    else if (event.type === "error") { const terminal = event.error; if (terminal?.stopReason === "aborted") yield { type: "aborted", usage: calculateUsageCost(mapUsage(terminal.usage, identity.protocol), pricing), reason: terminal.errorMessage ?? "pi-ai request aborted" }; else yield { type: "error", usage: calculateUsageCost(mapUsage(terminal?.usage, identity.protocol), pricing), failure: classifyFailure(terminal ?? new Error("pi-ai stream failed"), identity.endpoint, proxyState.failed) }; return; }
  }
  yield { type: "error", failure: { kind: "malformed-stream", message: "pi-ai stream ended without a terminal event.", retryable: false, attempt: 1 } };
}

function toActSpaceContent(content: readonly RuntimeV2JsonValue[], identity: { readonly providerId: string; readonly protocol: string; readonly modelId: string }): readonly LlmContentBlock[] { return content.flatMap((raw): LlmContentBlock[] => { const block = raw as { type?: string; text?: string; thinking?: string; thinkingSignature?: string; id?: string; name?: string; arguments?: RuntimeV2JsonValue }; if (block.type === "text") return [{ type: "text", text: block.text ?? "" }]; if (block.type === "thinking") { const replay: LlmReplayEnvelope | undefined = block.thinkingSignature === undefined ? undefined : { schemaVersion: 1, adapterFamily: "pi-ai", providerId: identity.providerId, protocol: identity.protocol, modelId: identity.modelId, payload: { thinkingSignature: block.thinkingSignature } }; return [{ type: "reasoning", text: block.thinking ?? "", ...(block.thinkingSignature ? { signature: block.thinkingSignature } : {}), ...(replay === undefined ? {} : { replay }) }]; } if (block.type === "toolCall") return [{ type: "tool-call", callId: block.id ?? "unknown", name: block.name ?? "unknown", arguments: JSON.stringify(block.arguments ?? {}) }]; return []; }); }
function mapUsage(usage: PiAiUsage | undefined, protocol: string): LlmUsage {
  // Only the pinned wire patch can distinguish provider facts from SDK defaults.
  // An unpatched/unsupported SDK must stay unknown rather than fabricate zeroes.
  const wire = usage?.actspaceWireUsage?.version === 1 ? usage.actspaceWireUsage : undefined;
  const input = wire?.input ?? null;
  const cacheRead = wire?.cacheRead ?? null;
  const cacheWrite = wire?.cacheWrite ?? null;
  return {
    inputTokens: input === null || protocol === "anthropic-messages" ? input : Math.max(0, input - (cacheRead ?? 0) - (cacheWrite ?? 0)),
    outputTokens: wire?.output ?? null,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    reasoningTokens: wire?.reasoning ?? null,
    cost: null, costCurrency: null,
    source: wire && [wire.input, wire.output, wire.cacheRead, wire.cacheWrite, wire.reasoning].some(value => value !== null) ? "provider-reported" : "unknown",
  };
}
function zeroUsage() { return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }; }
function mapStopReason(reason: string): string { return reason === "toolUse" ? "tool-calls" : reason === "length" ? "max-tokens" : reason; }
function messageText(message: LlmMessage): string { if (typeof message.content === "string") return message.content; return message.content.map((block) => block.type === "text" ? block.text : block.type === "reasoning" ? block.text : block.type === "tool-result" ? block.content : "").join(""); }
function parseArguments(value: string): RuntimeV2JsonValue { try { return JSON.parse(value) as RuntimeV2JsonValue; } catch { return { $raw: value }; } }
function failure(kind: LlmFailureKind, message: string): LlmRuntimeError { return new LlmRuntimeError({ kind, message, retryable: false, attempt: 1 }); }
function classifyFailure(error: unknown, endpoint?: string, proxyFailed = false): LlmFailure {
  const rawMessage = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && typeof (error as { errorMessage?: unknown }).errorMessage === "string"
      ? (error as { errorMessage: string }).errorMessage
      : String(error);
  const cause = transportCauseOf(error);
  const transport = transportKind(rawMessage, cause.code);
  const message = redactLlmText(rawMessage);
  const statusValue = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  const status = Number(statusValue ?? /\b(400|401|402|403|404|422|429|5\d\d)\b/.exec(message)?.[1]);
  const httpStatus = Number.isFinite(status) && status > 0 ? status : undefined;
  const providerCode = providerCodeFromUnknown(error);
  const contextOverflow = /context(?:_|\s|-)*(?:length|window)|too many tokens|maximum context/i.test(`${providerCode ?? ""} ${message}`);
  const kind: LlmFailureKind = proxyFailed || error instanceof ProviderProxyError
    ? "proxy"
    : contextOverflow
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
                  : transport === "timeout"
                    ? "timeout"
                    : /proxy/i.test(message)
                      ? "proxy"
                      : transport === "network" || /network|fetch|socket|ECONN|ENOTFOUND|EAI_AGAIN|connection error/i.test(message)
                        ? "network"
                        : "unknown";
  const retryAfterMs = retryAfterMsFromUnknown(error);
  return {
    kind,
    message: describeTransportFailure(kind, message, cause, endpoint),
    retryable: kind === "rate-limit" || kind === "provider" || kind === "network" || kind === "timeout" || kind === "proxy",
    ...(cause.code === undefined || (kind !== "timeout" && kind !== "network") ? {} : { causeCode: cause.code }),
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    ...(providerCode === undefined ? {} : { providerCode }),
    attempt: 1,
  };
}
