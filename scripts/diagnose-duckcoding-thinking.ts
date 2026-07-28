#!/usr/bin/env node

type Protocol = "responses" | "chat-completions";

type Scenario = {
  id: "responses-no-summary" | "responses-summary-auto" | "responses-generate-summary-auto" | "chat-grok";
  description: string;
  protocol: Protocol;
  modelKind: "codex" | "grok";
  reasoningSummary: "omitted" | "summary" | "generate_summary";
};

type CliOptions = {
  help: boolean;
  list: boolean;
  dryRun: boolean;
  json: boolean;
  showContent: boolean;
  codexModel: string;
  grokModel: string;
  timeoutMs: number;
  only: string[];
};

type StreamObservation = {
  eventTypes: Record<string, number>;
  deltaFields: Record<string, number>;
  outputTextChars: number;
  reasoningSummaryChars: number;
  reasoningTextChars: number;
  reasoningContentChars: number;
  reasoningChars: number;
  analysisChars: number;
  reasoningTokens?: number;
  finalReasoningItems: number;
  finalReasoningSummaryChars: number;
  encryptedReasoningItems: number;
  previews?: Record<string, string>;
};

type ProbeResult = {
  scenarioId: Scenario["id"];
  protocol: Protocol;
  model: string;
  url: string;
  status?: number;
  ok: boolean;
  durationMs: number;
  requestId?: string;
  observation: StreamObservation;
  error?: string;
};

const BASE_URL = (
  process.env.DUCKCODING_BASE_URL ??
  process.env.DUCKCODING_API_BASE_URL ??
  "https://api.duckcoding.ai/v1"
).replace(/\/$/, "");
const DEFAULT_CODEX_MODEL = process.env.DUCKCODING_CODEX_MODEL ?? "gpt-5.6-sol";
const DEFAULT_GROK_MODEL = process.env.DUCKCODING_GROK_MODEL ?? "grok-4.5";

const SCENARIOS: Scenario[] = [
  {
    id: "responses-no-summary",
    description: "Codex Responses baseline: encrypted reasoning state, no readable summary requested",
    protocol: "responses",
    modelKind: "codex",
    reasoningSummary: "omitted",
  },
  {
    id: "responses-summary-auto",
    description: "Codex Responses with reasoning.summary=auto",
    protocol: "responses",
    modelKind: "codex",
    reasoningSummary: "summary",
  },
  {
    id: "responses-generate-summary-auto",
    description: "Codex Responses with legacy reasoning.generate_summary=auto",
    protocol: "responses",
    modelKind: "codex",
    reasoningSummary: "generate_summary",
  },
  {
    id: "chat-grok",
    description: "Grok Chat Completions: inspect streamed delta field names and lengths",
    protocol: "chat-completions",
    modelKind: "grok",
    reasoningSummary: "omitted",
  },
];

const HELP = `DuckCoding thinking transport diagnosis

Usage:
  node --experimental-strip-types scripts/diagnose-duckcoding-thinking.ts [options]

Options:
  --help, -h              Show this help
  --list                  List scenarios without making requests
  --dry-run               Print the request matrix without making requests
  --codex-model <name>    Responses model (default: DUCKCODING_CODEX_MODEL or gpt-5.6-sol)
  --grok-model <name>     Chat model (default: DUCKCODING_GROK_MODEL or grok-4.5)
  --timeout-ms <number>   Per-request timeout (default: 90000)
  --only <ids>            Comma-separated scenario ids
  --show-content          Show at most 240 chars of returned text/reasoning fields
  --json                  Emit JSON

Environment:
  DUCKCODING_CODEX_API_KEY  API key for Codex Responses scenarios
  DUCKCODING_GROK_API_KEY   API key for the Grok Chat scenario
  DUCKCODING_BASE_URL     Optional base URL override
  DUCKCODING_CODEX_MODEL  Optional Codex model override
  DUCKCODING_GROK_MODEL   Optional Grok model override

Safety and cost:
  The default real run makes four paid requests.
  Codex and Grok keys are resolved independently and never used as fallbacks for each other.
  API keys and Authorization headers are never printed.
  Reasoning/text content is hidden unless --show-content is explicitly passed.
`;

function emptyObservation(): StreamObservation {
  return {
    eventTypes: {},
    deltaFields: {},
    outputTextChars: 0,
    reasoningSummaryChars: 0,
    reasoningTextChars: 0,
    reasoningContentChars: 0,
    reasoningChars: 0,
    analysisChars: 0,
    finalReasoningItems: 0,
    finalReasoningSummaryChars: 0,
    encryptedReasoningItems: 0,
  };
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function readValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${option} requires a value`);
  return value;
}

function parseInteger(value: string, option: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail(`${option} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    list: false,
    dryRun: false,
    json: false,
    showContent: false,
    codexModel: DEFAULT_CODEX_MODEL,
    grokModel: DEFAULT_GROK_MODEL,
    timeoutMs: 90_000,
    only: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") options.help = true;
    else if (item === "--list") options.list = true;
    else if (item === "--dry-run") options.dryRun = true;
    else if (item === "--json") options.json = true;
    else if (item === "--show-content") options.showContent = true;
    else if (item === "--codex-model") options.codexModel = readValue(argv, index++, item);
    else if (item === "--grok-model") options.grokModel = readValue(argv, index++, item);
    else if (item === "--timeout-ms") {
      options.timeoutMs = parseInteger(readValue(argv, index++, item), item, 1_000, 300_000);
    } else if (item === "--only") {
      options.only = readValue(argv, index++, item)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else {
      fail(`unknown option: ${item}`);
    }
  }

  return options;
}

function selectScenarios(only: string[]): Scenario[] {
  if (only.length === 0) return SCENARIOS;
  const knownIds = new Set(SCENARIOS.map((scenario) => scenario.id));
  const unknown = only.filter((id) => !knownIds.has(id as Scenario["id"]));
  if (unknown.length > 0) fail(`unknown scenario id(s): ${unknown.join(", ")}`);
  return SCENARIOS.filter((scenario) => only.includes(scenario.id));
}

function endpointFor(protocol: Protocol): string {
  return protocol === "responses" ? `${BASE_URL}/responses` : `${BASE_URL}/chat/completions`;
}

function modelFor(scenario: Scenario, options: CliOptions): string {
  return scenario.modelKind === "codex" ? options.codexModel : options.grokModel;
}

function apiKeyEnvironmentName(scenario: Scenario): "DUCKCODING_CODEX_API_KEY" | "DUCKCODING_GROK_API_KEY" {
  return scenario.modelKind === "codex" ? "DUCKCODING_CODEX_API_KEY" : "DUCKCODING_GROK_API_KEY";
}

function apiKeyForScenario(scenario: Scenario): string | undefined {
  return process.env[apiKeyEnvironmentName(scenario)];
}

function buildRequestBody(scenario: Scenario, model: string): Record<string, unknown> {
  const prompt = [
    "This is a transport diagnostic.",
    "Reason briefly about whether 17 is prime, then answer exactly: 17 is prime.",
    "Do not call tools.",
  ].join(" ");

  if (scenario.protocol === "responses") {
    return {
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      stream: true,
      store: false,
      include: ["reasoning.encrypted_content"],
      ...(scenario.reasoningSummary === "summary" && { reasoning: { summary: "auto" } }),
      ...(scenario.reasoningSummary === "generate_summary" && {
        reasoning: { generate_summary: "auto" },
      }),
      max_output_tokens: 256,
    };
  }

  return {
    model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0,
    max_completion_tokens: 256,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function stringValue(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function valueLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value === null || value === undefined) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function addCount(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function addPreview(
  observation: StreamObservation,
  key: string,
  value: unknown,
  showContent: boolean,
): void {
  if (!showContent || typeof value !== "string" || value.length === 0) return;
  observation.previews ??= {};
  observation.previews[key] = `${observation.previews[key] ?? ""}${value}`.slice(0, 240);
}

function reasoningTokensFromUsage(value: unknown): number | undefined {
  const usage = asRecord(value);
  const outputDetails = asRecord(usage?.output_tokens_details);
  const completionDetails = asRecord(usage?.completion_tokens_details);
  const candidate = outputDetails?.reasoning_tokens ?? completionDetails?.reasoning_tokens;
  return typeof candidate === "number" ? candidate : undefined;
}

function observeResponsesEvent(
  payload: Record<string, unknown>,
  observation: StreamObservation,
  showContent: boolean,
): void {
  const type = stringValue(payload, "type") ?? "unknown";
  addCount(observation.eventTypes, type);

  if (type === "response.output_text.delta") {
    const delta = stringValue(payload, "delta") ?? "";
    observation.outputTextChars += delta.length;
    addPreview(observation, "output_text", delta, showContent);
  } else if (type === "response.reasoning_summary_text.delta") {
    const delta = stringValue(payload, "delta") ?? "";
    observation.reasoningSummaryChars += delta.length;
    addPreview(observation, "reasoning_summary", delta, showContent);
  } else if (type === "response.reasoning_text.delta") {
    const delta = stringValue(payload, "delta") ?? "";
    observation.reasoningTextChars += delta.length;
    addPreview(observation, "reasoning_text", delta, showContent);
  }

  if (type === "response.output_item.done") {
    const item = asRecord(payload.item);
    if (item?.type === "reasoning") {
      observation.finalReasoningItems += 1;
      if (typeof item.encrypted_content === "string" && item.encrypted_content.length > 0) {
        observation.encryptedReasoningItems += 1;
      }
      const summary = Array.isArray(item.summary) ? item.summary : [];
      for (const part of summary) {
        const text = stringValue(asRecord(part), "text") ?? "";
        observation.finalReasoningSummaryChars += text.length;
        addPreview(observation, "final_reasoning_summary", text, showContent);
      }
    }
  }

  if (type === "response.completed" || type === "response.incomplete" || type === "response.failed") {
    const response = asRecord(payload.response);
    observation.reasoningTokens = reasoningTokensFromUsage(response?.usage) ?? observation.reasoningTokens;
  }
}

function observeChatChunk(
  payload: Record<string, unknown>,
  observation: StreamObservation,
  showContent: boolean,
): void {
  addCount(observation.eventTypes, "chat.chunk");
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = asRecord(choices[0]);
  const delta = asRecord(choice?.delta);
  if (delta) {
    for (const key of Object.keys(delta)) addCount(observation.deltaFields, key);
    const content = delta.content;
    const reasoningContent = delta.reasoning_content;
    const reasoning = delta.reasoning;
    const analysis = delta.analysis;
    observation.outputTextChars += valueLength(content);
    observation.reasoningContentChars += valueLength(reasoningContent);
    observation.reasoningChars += valueLength(reasoning);
    observation.analysisChars += valueLength(analysis);
    addPreview(observation, "output_text", content, showContent);
    addPreview(observation, "reasoning_content", reasoningContent, showContent);
    addPreview(observation, "reasoning", reasoning, showContent);
    addPreview(observation, "analysis", analysis, showContent);
  }
  observation.reasoningTokens = reasoningTokensFromUsage(payload.usage) ?? observation.reasoningTokens;
}

async function consumeSse(
  response: Response,
  protocol: Protocol,
  showContent: boolean,
): Promise<StreamObservation> {
  const observation = emptyObservation();
  if (!response.body) return observation;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = asRecord(JSON.parse(data));
        if (!payload) continue;
        if (protocol === "responses") observeResponsesEvent(payload, observation, showContent);
        else observeChatChunk(payload, observation, showContent);
      } catch {
        addCount(observation.eventTypes, "unparseable-data");
      }
    }
    if (done) break;
  }

  return observation;
}

function requestIdFrom(headers: Headers): string | undefined {
  for (const name of ["x-request-id", "request-id", "x-oneapi-request-id", "cf-ray"]) {
    const value = headers.get(name);
    if (value) return value;
  }
  return undefined;
}

function redact(value: string, apiKey: string): string {
  const keyRedacted = apiKey ? value.split(apiKey).join("[REDACTED_API_KEY]") : value;
  return keyRedacted
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]")
    .slice(0, 1_000);
}

async function safeErrorBody(response: Response, apiKey: string): Promise<string> {
  try {
    return redact(await response.text(), apiKey);
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function runProbe(
  scenario: Scenario,
  options: CliOptions,
  apiKey: string,
): Promise<ProbeResult> {
  const model = modelFor(scenario, options);
  const url = endpointFor(scenario.protocol);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRequestBody(scenario, model)),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.ok) {
      return {
        scenarioId: scenario.id,
        protocol: scenario.protocol,
        model,
        url,
        status: response.status,
        ok: false,
        durationMs: Math.round(performance.now() - startedAt),
        requestId: requestIdFrom(response.headers),
        observation: emptyObservation(),
        error: await safeErrorBody(response, apiKey),
      };
    }
    return {
      scenarioId: scenario.id,
      protocol: scenario.protocol,
      model,
      url,
      status: response.status,
      ok: true,
      durationMs: Math.round(performance.now() - startedAt),
      requestId: requestIdFrom(response.headers),
      observation: await consumeSse(response, scenario.protocol, options.showContent),
    };
  } catch (error) {
    return {
      scenarioId: scenario.id,
      protocol: scenario.protocol,
      model,
      url,
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      observation: emptyObservation(),
      error: redact(error instanceof Error ? error.message : String(error), apiKey),
    };
  }
}

function hasReadableReasoning(observation: StreamObservation): boolean {
  return observation.reasoningSummaryChars > 0 ||
    observation.finalReasoningSummaryChars > 0 ||
    observation.reasoningTextChars > 0 ||
    observation.reasoningContentChars > 0 ||
    observation.reasoningChars > 0 ||
    observation.analysisChars > 0;
}

function classify(results: ProbeResult[]): string[] {
  const findings: string[] = [];
  const baseline = results.find((result) => result.scenarioId === "responses-no-summary" && result.ok);
  const summary = results.find((result) => result.scenarioId === "responses-summary-auto" && result.ok);
  const legacySummary = results.find((result) => result.scenarioId === "responses-generate-summary-auto" && result.ok);
  const grok = results.find((result) => result.scenarioId === "chat-grok" && result.ok);

  if (baseline && (baseline.observation.reasoningTokens ?? 0) > 0 && !hasReadableReasoning(baseline.observation)) {
    findings.push("Codex baseline used reasoning tokens but returned no readable reasoning text. Reasoning computation and readable summaries are separate capabilities.");
  }
  if (summary && hasReadableReasoning(summary.observation)) {
    findings.push("Codex returned readable reasoning only when reasoning.summary=auto was requested. The runtime must request and parse reasoning summary events.");
  } else if (summary && (summary.observation.reasoningTokens ?? 0) > 0) {
    findings.push("Codex accepted reasoning.summary=auto and used reasoning tokens, but this gateway still returned no readable reasoning summary.");
  }
  if (baseline && baseline.observation.encryptedReasoningItems > 0 && !hasReadableReasoning(baseline.observation)) {
    findings.push("Encrypted reasoning items are opaque replay state, not user-readable Thinking content.");
  }
  if (legacySummary && hasReadableReasoning(legacySummary.observation)) {
    findings.push("Codex returned readable reasoning with legacy reasoning.generate_summary=auto. This gateway expects the deprecated summary parameter.");
  } else if (legacySummary && (legacySummary.observation.reasoningTokens ?? 0) > 0) {
    findings.push("Codex accepted legacy reasoning.generate_summary=auto and used reasoning tokens, but still returned no readable reasoning summary.");
  } else if (legacySummary) {
    findings.push("Codex accepted legacy reasoning.generate_summary=auto but returned neither reasoning state nor a readable summary. The deprecated parameter is not a usable Thinking path on this gateway.");
  }
  if (grok) {
    const fields = Object.keys(grok.observation.deltaFields);
    const readableFields = ["reasoning_content", "reasoning", "analysis"].filter((field) =>
      fields.includes(field) && (
        field === "reasoning_content" ? grok.observation.reasoningContentChars > 0 :
        field === "reasoning" ? grok.observation.reasoningChars > 0 :
        grok.observation.analysisChars > 0
      )
    );
    if (readableFields.length > 0) {
      findings.push(`Grok exposed readable reasoning through: ${readableFields.join(", ")}. The Chat converter must normalize the matching field.`);
    } else if ((grok.observation.reasoningTokens ?? 0) > 0) {
      findings.push("Grok reported reasoning tokens but exposed no readable reasoning_content/reasoning/analysis delta in this Chat stream.");
    } else {
      findings.push("Grok exposed no recognized readable reasoning field and reported no reasoning-token usage in this probe.");
    }
  }
  if (results.some((result) => !result.ok)) {
    findings.push(`Failed scenarios: ${results.filter((result) => !result.ok).map((result) => result.scenarioId).join(", ")}. HTTP errors remain useful compatibility evidence.`);
  }
  return findings.length > 0 ? findings : ["No conclusive difference was observed; inspect the event and delta field inventories above."];
}

function printScenarioList(scenarios: Scenario[], options: CliOptions): void {
  console.table(scenarios.map((scenario) => ({
    id: scenario.id,
    protocol: scenario.protocol,
    model: modelFor(scenario, options),
    summary: scenario.reasoningSummary === "omitted" ? "omitted" : `${scenario.reasoningSummary}=auto`,
    description: scenario.description,
  })));
}

function printResults(results: ProbeResult[]): void {
  console.table(results.map((result) => ({
    scenario: result.scenarioId,
    http: result.status ?? "ERR",
    ms: result.durationMs,
    reasoningTokens: result.observation.reasoningTokens ?? "-",
    summaryDeltaChars: result.observation.reasoningSummaryChars,
    finalSummaryChars: result.observation.finalReasoningSummaryChars,
    reasoningContentChars: result.observation.reasoningContentChars,
    reasoningChars: result.observation.reasoningChars,
    analysisChars: result.observation.analysisChars,
    encryptedItems: result.observation.encryptedReasoningItems,
    outputChars: result.observation.outputTextChars,
  })));
  for (const result of results) {
    console.log(`\n${result.scenarioId}`);
    console.log(`  events: ${JSON.stringify(result.observation.eventTypes)}`);
    console.log(`  delta fields: ${JSON.stringify(result.observation.deltaFields)}`);
    console.log(`  request id: ${result.requestId ?? "-"}`);
    if (result.observation.previews) console.log(`  previews: ${JSON.stringify(result.observation.previews)}`);
    if (result.error) console.log(`  error: ${result.error}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }
  const scenarios = selectScenarios(options.only);
  if (options.list) {
    if (options.json) console.log(JSON.stringify(scenarios, null, 2));
    else printScenarioList(scenarios, options);
    return;
  }
  if (options.dryRun) {
    const summary = {
      dryRun: true,
      baseUrl: BASE_URL,
      plannedPaidRequests: scenarios.length,
      contentPreviewEnabled: options.showContent,
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id,
        protocol: scenario.protocol,
        model: modelFor(scenario, options),
        url: endpointFor(scenario.protocol),
        reasoningSummary: scenario.reasoningSummary === "omitted"
          ? "omitted"
          : `${scenario.reasoningSummary}=auto`,
      })),
    };
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`Dry run: ${summary.plannedPaidRequests} paid requests would be made.`);
      console.log(`Base URL: ${BASE_URL}`);
      console.log(`Content previews: ${options.showContent ? "enabled" : "disabled"}`);
      printScenarioList(scenarios, options);
    }
    return;
  }

  const missingKeyNames = [...new Set(
    scenarios
      .filter((scenario) => !apiKeyForScenario(scenario))
      .map(apiKeyEnvironmentName),
  )];
  if (missingKeyNames.length > 0) {
    fail(`set ${missingKeyNames.join(" and ")} before running the selected scenario(s)`);
  }

  const results: ProbeResult[] = [];
  for (const scenario of scenarios) {
    if (!options.json) console.log(`Running ${scenario.id}: ${scenario.description}`);
    results.push(await runProbe(scenario, options, apiKeyForScenario(scenario)!));
  }
  const findings = classify(results);
  if (options.json) console.log(JSON.stringify({ results, findings }, null, 2));
  else {
    console.log("\nResults");
    printResults(results);
    console.log("\nInterpretation");
    findings.forEach((finding) => console.log(`- ${finding}`));
  }
  if (!results.some((result) => result.ok)) process.exitCode = 2;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const withoutCodexKey = redact(message, process.env.DUCKCODING_CODEX_API_KEY ?? "");
  const withoutGrokKey = redact(withoutCodexKey, process.env.DUCKCODING_GROK_API_KEY ?? "");
  console.error(`Unexpected error: ${withoutGrokKey}`);
  process.exitCode = 1;
});
