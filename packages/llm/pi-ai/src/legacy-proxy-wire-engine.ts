import { prepareImageMessages } from "./image-messages.js";
import { validateDeepSeekImage, validateDeepSeekImageMessages, validateDeepSeekPayload } from "./deepseek-images.js";
import { catalogProviderForEndpoint, type ModelPricingSnapshot } from "@actspace/shared";
import { calculateUsageCost } from "@actspace/llm-service";
import { reasoningPayload } from "./reasoning-options.js";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";
import { providerCodeFromUnknown, retryAfterMsFromUnknown, type LlmFailure, type LlmFailureKind } from "@actspace/llm-service";
import type { LlmContentBlock, LlmMessage, LlmToolDefinition } from "@actspace/llm-service";
import type { PiAiEngine } from "./pi-ai-adapter.js";
import type { PiAiArtifactReader, PiAiWireRoute } from "./pi-ai-wire-engine.js";
import { ProviderProxyError, ProviderProxyPool } from "@actspace/llm-service";
import { redactLlmText } from "@actspace/llm-service";
import type { LlmStreamEvent, LlmStreamSource } from "@actspace/llm-service";
import type { LlmUsage } from "@actspace/llm-service";

type SdkClient = Record<string, unknown>;
type SdkConstructor = new (options: Record<string, unknown>) => SdkClient;
export type LegacyProxySdkLoader = (route: PiAiWireRoute) => Promise<SdkConstructor>;

export type LegacyProxyWireEngineOptions = {
  readonly modelFacts?: import("./pi-ai-wire-engine.js").PiAiWireEngineOptions["modelFacts"];
  readonly pricing?: ModelPricingSnapshot | null;
  readonly route: PiAiWireRoute;
  readonly providerId: string;
  readonly modelId?: string;
  readonly baseUrl?: string;
  readonly readArtifact?: PiAiArtifactReader;
  readonly proxies?: ProviderProxyPool;
  readonly loadSdk?: LegacyProxySdkLoader;
};

type Accumulator = {
  readonly text: string[];
  readonly reasoning: string[];
  readonly signatures: string[];
  readonly calls: Map<number, { callId: string; name: string; arguments: string }>;
  usage: LlmUsage;
  stopReason: string | null;
};

/** Public SDK transport for scoped proxies and OpenRouter raw billed usage. */
export class LegacyProxyWireEngine implements PiAiEngine {
  readonly #loadSdk: LegacyProxySdkLoader;
  constructor(private readonly options: LegacyProxyWireEngineOptions) { this.#loadSdk = options.loadSdk ?? loadPublicSdk; }

  async stream(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> {
    input = { ...input, request: { ...input.request, messages: prepareImageMessages(input.request.messages, this.options.modelFacts?.input.includes("image") ?? true, this.options.route === "anthropic-messages") } };
    const proxyUrl = input.credential.proxyUrl;
    const baseURL = input.credential.baseUrl ?? this.options.baseUrl;
    if (baseURL === undefined) throw new Error(`No base URL is configured for route ${input.request.routeId}.`);
    if (proxyUrl === undefined && catalogProviderForEndpoint(baseURL) !== "openrouter") throw new Error("Legacy proxy backend requires a request-scoped proxy URL.");
    if (proxyUrl !== undefined && !this.options.proxies) throw new Error("Missing request-scoped proxy pool.");
    const fetch = proxyUrl === undefined ? undefined : await this.options.proxies!.getFetch(proxyUrl);
    const Constructor = await this.#loadSdk(this.options.route);
    const client = new Constructor({ apiKey: input.credential.apiKey ?? "placeholder", baseURL, maxRetries: 0, fetch, defaultHeaders: input.credential.headers });
    if (this.options.route === "anthropic-messages") return anthropicStream(client, input, this.options);
    if (this.options.route === "openai-responses") return responsesStream(client, input, this.options);
    return completionsStream(client, input, this.options);
  }
}

async function* completionsStream(client: SdkClient, input: LlmAdapterDispatchInput, options: LegacyProxyWireEngineOptions): AsyncGenerator<LlmStreamEvent> {
  const acc = accumulator();
  let terminalSeen = false;
  try {
    const chat = client.chat as { completions: { create(params: unknown, options: unknown): Promise<AsyncIterable<unknown>> } };
    const deepseek = options.providerId === "deepseek";
    if (deepseek) validateDeepSeekImageMessages(input.request.messages, options.modelFacts?.input.includes("image") ?? true);
    const readArtifact = options.readArtifact;
    const checkedReader: PiAiArtifactReader | undefined = deepseek && readArtifact ? async (sessionId, artifactId) => {
      const artifact = await readArtifact(sessionId, artifactId);
      return { ...artifact, mimeType: validateDeepSeekImage(artifact.data) };
    } : readArtifact;
    const body = {
      model: options.modelId ?? input.request.model,
      messages: await toOpenAiMessages(input.request.messages, input.request.sessionId, checkedReader, deepseek),
      stream: true,
      ...reasoningPayload(options.route, options.providerId, input.request.options),
      stream_options: { include_usage: true },
      ...(input.request.options.temperature === undefined ? {} : { temperature: input.request.options.temperature }),
      ...(input.request.options.maxTokens === undefined ? {} : { max_tokens: input.request.options.maxTokens }),
      ...(input.request.tools.length === 0 ? {} : { tools: toOpenAiTools(input.request.tools) }),
    };
    if (deepseek) validateDeepSeekPayload(body);
    const stream = await chat.completions.create(body, { signal: input.signal });
    for await (const raw of stream) {
      const chunk = raw as Record<string, unknown>;
      const choice = (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const delta = choice?.delta as Record<string, unknown> | undefined;
      const reasoning = typeof delta?.reasoning_content === "string" ? delta.reasoning_content : undefined;
      if (reasoning) { acc.reasoning.push(reasoning); yield { type: "reasoning-delta", text: reasoning }; }
      const text = typeof delta?.content === "string" ? delta.content : undefined;
      if (text) { acc.text.push(text); yield { type: "text-delta", text }; }
      const toolCalls = delta?.tool_calls as Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> | undefined;
      for (const tool of toolCalls ?? []) {
        const index = tool.index ?? 0; const current = acc.calls.get(index) ?? { callId: "", name: "", arguments: "" };
        current.callId = tool.id ?? current.callId; current.name += tool.function?.name ?? ""; current.arguments += tool.function?.arguments ?? ""; acc.calls.set(index, current);
        yield { type: "tool-call-delta", callId: current.callId || `${input.request.requestId}:${index}`, name: current.name || "unknown", argumentsDelta: tool.function?.arguments ?? "" };
      }
      if (typeof choice?.finish_reason === "string") {
        acc.stopReason = mapStopReason(choice.finish_reason);
        terminalSeen = true;
      }
      const usage = chunk.usage as Record<string, unknown> | undefined;
      if (usage != null) acc.usage = withOpenRouterCost(mapOpenAiUsage(usage), usage, input.credential.baseUrl ?? options.baseUrl);
    }
    yield terminalSeen ? done(acc, options.pricing ?? null) : { ...malformedStream(options.route), usage: calculateUsageCost(acc.usage, options.pricing ?? null) };
  } catch (error) { yield { ...terminalFailure(error, input.signal), usage: calculateUsageCost(acc.usage, options.pricing ?? null) }; }
}

async function* responsesStream(client: SdkClient, input: LlmAdapterDispatchInput, options: LegacyProxyWireEngineOptions): AsyncGenerator<LlmStreamEvent> {
  const acc = accumulator();
  let terminalSeen = false;
  try {
    const responses = client.responses as { create(params: unknown, options: unknown): Promise<AsyncIterable<unknown>> };
    const converted = await toResponsesInput(input.request.messages, input.request.sessionId, options.readArtifact);
    const stream = await responses.create({
      model: options.modelId ?? input.request.model,
      input: converted.input,
      stream: true,
      ...reasoningPayload(options.route, options.providerId, input.request.options),
      store: false,
      include: ["reasoning.encrypted_content"],
      ...(converted.instructions ? { instructions: converted.instructions } : {}),
      ...(input.request.options.temperature === undefined ? {} : { temperature: input.request.options.temperature }),
      ...(input.request.options.maxTokens === undefined ? {} : { max_output_tokens: input.request.options.maxTokens }),
      ...(input.request.tools.length === 0 ? {} : { tools: toResponsesTools(input.request.tools) }),
    }, { signal: input.signal });
    for await (const raw of stream) {
      const event = raw as Record<string, unknown>; const type = String(event.type ?? "");
      if (type === "response.output_text.delta") { const text = String(event.delta ?? ""); acc.text.push(text); yield { type: "text-delta", text }; continue; }
      if (type === "response.reasoning_summary_text.delta") { const text = String(event.delta ?? ""); acc.reasoning.push(text); yield { type: "reasoning-delta", text }; continue; }
      if (type === "response.output_item.added") {
        const item = event.item as Record<string, unknown>; if (item?.type === "function_call") { const index = numberValue(event.output_index); const call = { callId: String(item.call_id ?? item.id ?? `${input.request.requestId}:${index}`), name: String(item.name ?? "unknown"), arguments: String(item.arguments ?? "") }; acc.calls.set(index, call); if (call.arguments) yield { type: "tool-call-delta", callId: call.callId, name: call.name, argumentsDelta: call.arguments }; }
        continue;
      }
      if (type === "response.function_call_arguments.delta") { const index = numberValue(event.output_index); const call = acc.calls.get(index) ?? { callId: String(event.item_id ?? `${input.request.requestId}:${index}`), name: "unknown", arguments: "" }; const delta = String(event.delta ?? ""); call.arguments += delta; acc.calls.set(index, call); yield { type: "tool-call-delta", callId: call.callId, name: call.name, argumentsDelta: delta }; continue; }
      if (type === "response.output_item.done") { const item = event.item as Record<string, unknown>; if (item?.type === "reasoning") { const signature = JSON.stringify(item); acc.signatures.push(signature); const summary = (item.summary as Array<{ text?: string }> | undefined)?.map((part) => part.text ?? "").join("\n") ?? ""; if (summary && acc.reasoning.length === 0) acc.reasoning.push(summary); } continue; }
      if (type === "response.completed" || type === "response.incomplete") { const response = event.response as Record<string, unknown>; const usage = response?.usage as Record<string, unknown> | undefined; if (usage) acc.usage = withOpenRouterCost(mapResponsesUsage(usage), usage, input.credential.baseUrl ?? options.baseUrl); const reason = String((response?.incomplete_details as Record<string, unknown> | undefined)?.reason ?? response?.status ?? "stop"); acc.stopReason = mapStopReason(reason); if (type === "response.incomplete" && reason !== "max_output_tokens") { yield { ...terminalFailure(new Error(`Response incomplete: ${reason}`), input.signal), usage: calculateUsageCost(acc.usage, options.pricing ?? null) }; return; } terminalSeen = true; continue; }
      if (type === "response.failed" || type === "error") { const usage = (event.response as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined; if (usage) acc.usage = withOpenRouterCost(mapResponsesUsage(usage), usage, input.credential.baseUrl ?? options.baseUrl); yield { ...terminalFailure(new Error(responseError(event)), input.signal), usage: calculateUsageCost(acc.usage, options.pricing ?? null) }; return; }
    }
    yield terminalSeen ? done(acc, options.pricing ?? null) : { ...malformedStream(options.route), usage: calculateUsageCost(acc.usage, options.pricing ?? null) };
  } catch (error) { yield { ...terminalFailure(error, input.signal), usage: calculateUsageCost(acc.usage, options.pricing ?? null) }; }
}

async function* anthropicStream(client: SdkClient, input: LlmAdapterDispatchInput, options: LegacyProxyWireEngineOptions): AsyncGenerator<LlmStreamEvent> {
  const acc = accumulator();
  let terminalSeen = false;
  try {
    const messagesApi = client.messages as { stream(params: unknown, options: unknown): AsyncIterable<unknown> };
    const converted = await toAnthropicMessages(input.request.messages, input.request.sessionId, options.readArtifact);
    const stream = messagesApi.stream({
      model: options.modelId ?? input.request.model,
      max_tokens: input.request.options.maxTokens ?? 32_768,
      messages: converted.messages,
      ...(converted.system ? { system: converted.system } : {}),
      ...(input.request.options.temperature === undefined ? {} : { temperature: input.request.options.temperature }),
      ...(input.request.options.reasoning ? { thinking: { type: "enabled", budget_tokens: Math.min(16_384, Math.max(1_024, (input.request.options.maxTokens ?? 32_768) - 1_024)) } } : {}),
      ...(input.request.tools.length === 0 ? {} : { tools: toAnthropicTools(input.request.tools) }),
    }, { signal: input.signal });
    for await (const raw of stream) {
      const event = raw as Record<string, unknown>; const type = String(event.type ?? "");
      if (type === "message_start") { const usage = (event.message as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined; if (usage) acc.usage = mapAnthropicUsage(usage, acc.usage); continue; }
      if (type === "content_block_start") { const index = numberValue(event.index); const block = event.content_block as Record<string, unknown>; if (block?.type === "tool_use") acc.calls.set(index, { callId: String(block.id ?? `${input.request.requestId}:${index}`), name: String(block.name ?? "unknown"), arguments: "" }); if (block?.type === "thinking" && typeof block.signature === "string") acc.signatures.push(block.signature); continue; }
      if (type === "content_block_delta") {
        const index = numberValue(event.index); const delta = event.delta as Record<string, unknown>; const deltaType = String(delta?.type ?? "");
        if (deltaType === "text_delta") { const text = String(delta.text ?? ""); acc.text.push(text); yield { type: "text-delta", text }; }
        else if (deltaType === "thinking_delta") { const text = String(delta.thinking ?? ""); acc.reasoning.push(text); yield { type: "reasoning-delta", text }; }
        else if (deltaType === "signature_delta") acc.signatures.push(String(delta.signature ?? ""));
        else if (deltaType === "input_json_delta") { const call = acc.calls.get(index) ?? { callId: `${input.request.requestId}:${index}`, name: "unknown", arguments: "" }; const text = String(delta.partial_json ?? ""); call.arguments += text; acc.calls.set(index, call); yield { type: "tool-call-delta", callId: call.callId, name: call.name, argumentsDelta: text }; }
        continue;
      }
      if (type === "message_delta") { const usage = event.usage as Record<string, unknown> | undefined; if (usage) acc.usage = mapAnthropicUsage(usage, acc.usage); const stop = (event.delta as Record<string, unknown> | undefined)?.stop_reason; if (typeof stop === "string") { acc.stopReason = mapStopReason(stop); terminalSeen = true; } }
      if (type === "message_stop") terminalSeen = true;
    }
    yield terminalSeen ? done(acc, options.pricing ?? null) : { ...malformedStream(options.route), usage: calculateUsageCost(acc.usage, options.pricing ?? null) };
  } catch (error) { yield { ...terminalFailure(error, input.signal), usage: calculateUsageCost(acc.usage, options.pricing ?? null) }; }
}

async function toOpenAiMessages(messages: readonly LlmMessage[], sessionId?: string, readArtifact?: PiAiArtifactReader, deepseek = false): Promise<RuntimeV2JsonValue[]> {
  const output: RuntimeV2JsonValue[] = [];
  for (const message of messages) {
    if (message.role === "system") { output.push({ role: "system", content: messageText(message) }); continue; }
    if (message.role === "user") { output.push({ role: "user", content: await toOpenAiUserContent(message, sessionId, readArtifact) }); continue; }
    if (message.role === "assistant") { const blocks = blocksOf(message); const text = blocks.filter(isText).map((block) => block.text).join(""); const calls = blocks.filter(isToolCall); output.push({ role: "assistant", content: text || null, ...(deepseek ? { reasoning_content: blocks.filter((block) => block.type === "reasoning").map((block) => block.type === "reasoning" ? block.text : "").join("") } : {}), ...(calls.length ? { tool_calls: calls.map((call) => ({ id: call.callId, type: "function", function: { name: call.name, arguments: call.arguments } })) } : {}) }); continue; }
    output.push({ role: "tool", tool_call_id: message.callId ?? "unknown", content: messageText(message) });
  }
  return output;
}

async function toOpenAiUserContent(message: LlmMessage, sessionId?: string, readArtifact?: PiAiArtifactReader): Promise<RuntimeV2JsonValue> {
  if (typeof message.content === "string") return message.content;
  const output: RuntimeV2JsonValue[] = [];
  for (const block of message.content) {
    if (block.type === "text") output.push({ type: "text", text: block.text });
    else if (block.type === "image") output.push({ type: "image_url", image_url: { url: await artifactDataUrl(block.artifactId, block.mimeType, sessionId, readArtifact) } });
  }
  return output;
}

async function toResponsesInput(messages: readonly LlmMessage[], sessionId?: string, readArtifact?: PiAiArtifactReader): Promise<{ readonly instructions: string; readonly input: RuntimeV2JsonValue[] }> {
  const instructions = messages.filter((message) => message.role === "system").map(messageText).join("\n\n"); const input: RuntimeV2JsonValue[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") { const content: RuntimeV2JsonValue[] = []; for (const block of blocksOf(message)) { if (block.type === "text") content.push({ type: "input_text", text: block.text }); else if (block.type === "image") content.push({ type: "input_image", image_url: await artifactDataUrl(block.artifactId, block.mimeType, sessionId, readArtifact) }); } input.push({ role: "user", content }); continue; }
    if (message.role === "assistant") { for (const block of blocksOf(message)) { if (block.type === "text") input.push({ role: "assistant", content: [{ type: "output_text", text: block.text, annotations: [] }] }); else if (block.type === "tool-call") input.push({ type: "function_call", call_id: block.callId, name: block.name, arguments: block.arguments }); } continue; }
    input.push({ type: "function_call_output", call_id: message.callId ?? "unknown", output: messageText(message) });
  }
  return { instructions, input };
}

async function toAnthropicMessages(messages: readonly LlmMessage[], sessionId?: string, readArtifact?: PiAiArtifactReader): Promise<{ readonly system: string; readonly messages: RuntimeV2JsonValue[] }> {
  const system = messages.filter((message) => message.role === "system").map(messageText).join("\n\n"); const output: RuntimeV2JsonValue[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") { const content: RuntimeV2JsonValue[] = []; for (const block of blocksOf(message)) { if (block.type === "text") content.push({ type: "text", text: block.text }); else if (block.type === "image") { const dataUrl = await artifactDataUrl(block.artifactId, block.mimeType, sessionId, readArtifact); content.push({ type: "image", source: { type: "base64", media_type: anthropicMediaType(block.mimeType), data: dataUrl.slice(dataUrl.indexOf(",") + 1) } }); } } output.push({ role: "user", content }); continue; }
    if (message.role === "assistant") { const content: RuntimeV2JsonValue[] = []; for (const block of blocksOf(message)) { if (block.type === "text") content.push({ type: "text", text: block.text }); else if (block.type === "reasoning" && block.signature) content.push({ type: "thinking", thinking: block.text, signature: block.signature }); else if (block.type === "tool-call") content.push({ type: "tool_use", id: block.callId, name: block.name, input: parseArguments(block.arguments) }); } if (content.length) output.push({ role: "assistant", content }); continue; }
    const content: RuntimeV2JsonValue[] = [];
    for (const block of blocksOf(message)) {
      if (block.type === "image") {
        const dataUrl = await artifactDataUrl(block.artifactId, block.mimeType, sessionId, readArtifact);
        content.push({ type: "image", source: { type: "base64", media_type: anthropicMediaType(block.mimeType), data: dataUrl.slice(dataUrl.indexOf(",") + 1) } });
      } else if (block.type === "text") content.push({ type: "text", text: block.text });
    }
    const result = { type: "tool_result", tool_use_id: message.callId ?? "unknown", content: content.some((block) => (block as { type?: string }).type === "image") ? content : messageText(message) }; const previous = output.at(-1) as { role?: string; content?: RuntimeV2JsonValue[] } | undefined; if (previous?.role === "user" && Array.isArray(previous.content) && previous.content.every((part) => typeof part === "object" && part !== null && (part as { type?: string }).type === "tool_result")) previous.content.push(result); else output.push({ role: "user", content: [result] });
  }
  return { system, messages: output };
}

function toOpenAiTools(tools: readonly LlmToolDefinition[]): RuntimeV2JsonValue[] { return tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })); }
function toResponsesTools(tools: readonly LlmToolDefinition[]): RuntimeV2JsonValue[] { return tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.inputSchema, strict: false })); }
function toAnthropicTools(tools: readonly LlmToolDefinition[]): RuntimeV2JsonValue[] { return tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: { type: "object", ...(tool.inputSchema as Record<string, RuntimeV2JsonValue>) } })); }
function blocksOf(message: LlmMessage): readonly LlmContentBlock[] { return typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content; }
function messageText(message: LlmMessage): string { return blocksOf(message).map((block) => block.type === "text" || block.type === "reasoning" ? block.text : block.type === "tool-result" ? block.content : "").join(""); }
function isText(block: LlmContentBlock): block is Extract<LlmContentBlock, { type: "text" }> { return block.type === "text"; }
function isToolCall(block: LlmContentBlock): block is Extract<LlmContentBlock, { type: "tool-call" }> { return block.type === "tool-call"; }
async function artifactDataUrl(artifactId: string, mimeType: string, sessionId?: string, readArtifact?: PiAiArtifactReader): Promise<string> { if (sessionId === undefined || readArtifact === undefined) throw new Error("Image input requires a Session-bound ActSpace artifact reader."); const artifact = await readArtifact(sessionId, artifactId); return `data:${artifact.mimeType || mimeType};base64,${Buffer.from(artifact.data).toString("base64")}`; }
function anthropicMediaType(value: string): string { return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(value) ? value : "image/png"; }
function parseArguments(value: string): RuntimeV2JsonValue { try { return JSON.parse(value) as RuntimeV2JsonValue; } catch { return { $raw: value }; } }
function accumulator(): Accumulator { return { text: [], reasoning: [], signatures: [], calls: new Map(), usage: unknownUsage(), stopReason: null }; }
function done(acc: Accumulator, pricing: ModelPricingSnapshot | null): Extract<LlmStreamEvent, { type: "done" }> { const content: LlmContentBlock[] = []; const reasoning = acc.reasoning.join(""); if (reasoning || acc.signatures.length) content.push({ type: "reasoning", text: reasoning, ...(acc.signatures.at(-1) ? { signature: acc.signatures.at(-1) } : {}) }); const text = acc.text.join(""); if (text) content.push({ type: "text", text }); for (const call of [...acc.calls].sort(([left], [right]) => left - right).map(([, value]) => value)) content.push({ type: "tool-call", callId: call.callId, name: call.name, arguments: call.arguments }); return { type: "done", stopReason: acc.calls.size ? "tool-calls" : acc.stopReason, usage: calculateUsageCost(acc.usage, pricing), content }; }
function terminalFailure(error: unknown, signal: AbortSignal): Extract<LlmStreamEvent, { type: "error" | "aborted" }> { if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return { type: "aborted", reason: "LLM request aborted." }; return { type: "error", failure: classifyFailure(error) }; }
function malformedStream(route: PiAiWireRoute): Extract<LlmStreamEvent, { type: "error" }> { return { type: "error", failure: { kind: "malformed-stream", message: `Provider stream for route ${route} ended without a terminal event.`, retryable: true, attempt: 1 } }; }
function classifyFailure(error: unknown): LlmFailure { const raw = error instanceof Error ? error.message : String(error); const message = redactLlmText(raw); const status = Number((error as { status?: unknown } | null)?.status ?? /\b(401|402|403|429|5\d\d)\b/.exec(message)?.[1]); const httpStatus = Number.isFinite(status) && status > 0 ? status : undefined; const kind: LlmFailureKind = error instanceof ProviderProxyError ? "proxy" : httpStatus === 401 ? "authentication" : httpStatus === 402 ? "quota" : httpStatus === 403 ? "permission" : httpStatus === 429 ? "rate-limit" : httpStatus !== undefined && httpStatus >= 500 ? "provider" : /context|token limit/i.test(message) ? "context-overflow" : /timeout/i.test(message) ? "timeout" : /network|fetch|socket|ECONN|DNS/i.test(message) ? "network" : /invalid|bad request/i.test(message) ? "invalid-request" : "unknown"; const retryAfterMs = retryAfterMsFromUnknown(error); const providerCode = providerCodeFromUnknown(error); return { kind, message, retryable: ["rate-limit", "provider", "network", "timeout", "proxy"].includes(kind), ...(httpStatus === undefined ? {} : { httpStatus }), ...(retryAfterMs === undefined ? {} : { retryAfterMs }), ...(providerCode === undefined ? {} : { providerCode }), attempt: 1 }; }
function mapStopReason(value: string): string { if (["tool_calls", "tool_use", "requires_action"].includes(value)) return "tool-calls"; if (["length", "max_tokens", "max_output_tokens", "incomplete"].includes(value)) return "max-tokens"; return value === "end_turn" || value === "completed" ? "stop" : value; }
function mapOpenAiUsage(usage: Record<string, unknown>): LlmUsage { const input = numberOrNull(usage.prompt_tokens); const output = numberOrNull(usage.completion_tokens); const inputDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined; const outputDetails = usage.completion_tokens_details as Record<string, unknown> | undefined; const cacheRead = numberOrNull(usage.prompt_cache_hit_tokens ?? inputDetails?.cached_tokens ?? usage.cached_tokens); const cacheWrite = numberOrNull(usage.prompt_cache_write_tokens ?? inputDetails?.cache_write_tokens); return reportedUsage(input === null ? null : input - (cacheRead ?? 0) - (cacheWrite ?? 0), output, cacheRead, cacheWrite, numberOrNull(outputDetails?.reasoning_tokens)); }
function mapResponsesUsage(usage: Record<string, unknown>): LlmUsage { const inputDetails = usage.input_tokens_details as Record<string, unknown> | undefined; const outputDetails = usage.output_tokens_details as Record<string, unknown> | undefined; const totalInput = numberOrNull(usage.input_tokens); return reportedUsage(totalInput === null ? null : totalInput - (numberOrNull(inputDetails?.cached_tokens) ?? 0) - (numberOrNull(inputDetails?.cache_write_tokens) ?? 0), numberOrNull(usage.output_tokens), numberOrNull(inputDetails?.cached_tokens), numberOrNull(inputDetails?.cache_write_tokens), numberOrNull(outputDetails?.reasoning_tokens)); }
function mapAnthropicUsage(usage: Record<string, unknown>, previous: LlmUsage): LlmUsage { return reportedUsage(numberOrNull(usage.input_tokens) ?? previous.inputTokens, numberOrNull(usage.output_tokens) ?? previous.outputTokens, numberOrNull(usage.cache_read_input_tokens) ?? previous.cacheReadTokens, numberOrNull(usage.cache_creation_input_tokens) ?? previous.cacheWriteTokens, previous.reasoningTokens); }
function reportedUsage(input: number | null, output: number | null, cacheRead: number | null, cacheWrite: number | null, reasoning: number | null): LlmUsage { return { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, reasoningTokens: reasoning, cost: null, costCurrency: null, source: "provider-reported" }; }
function unknownUsage(): LlmUsage { return { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cost: null, costCurrency: null, source: "unknown" }; }
function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function numberValue(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0; }
function responseError(event: Record<string, unknown>): string { const response = event.response as Record<string, unknown> | undefined; const error = response?.error as Record<string, unknown> | undefined; return String(error?.message ?? event.message ?? "Responses stream failed."); }

async function loadPublicSdk(route: PiAiWireRoute): Promise<SdkConstructor> {
  const packageName: string = route === "anthropic-messages" ? "@anthropic-ai/sdk" : "openai";
  const module = await import(packageName) as { readonly default?: SdkConstructor };
  if (typeof module.default !== "function") throw new Error(`${packageName} public default export is unavailable.`);
  return module.default;
}

/** Only trust a raw billed amount from the documented endpoint, never SDK calculated cost. */
function withOpenRouterCost(usage: LlmUsage, raw: Record<string, unknown>, baseUrl?: string): LlmUsage {
  const cost = numberOrNull(raw.cost);
  if (catalogProviderForEndpoint(baseUrl ?? "") !== "openrouter" || cost === null || cost < 0) return usage;
  return { ...usage, cost, costCurrency: "USD", costProvenance: { version: 1, basis: "provider-reported", reason: null, pricingSnapshot: null } };
}
