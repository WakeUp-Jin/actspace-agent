#!/usr/bin/env node

const { createHash, randomBytes } = require("node:crypto");

type Protocol = "chat-completions" | "responses";

type Scenario = {
  id: string;
  description: string;
  baseUrl: string;
  protocol: Protocol;
  cacheKey: boolean;
  tools: boolean;
  explicitCache: boolean;
};

type CliOptions = {
  help: boolean;
  list: boolean;
  dryRun: boolean;
  json: boolean;
  model: string;
  repeats: number;
  delayMs: number;
  timeoutMs: number;
  only: string[];
};

type NormalizedUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  cacheMissTokens?: number;
  raw?: unknown;
};

type ProbeResult = {
  scenarioId: string;
  repeat: number;
  protocol: Protocol;
  url: string;
  model: string;
  cacheKey?: string;
  status?: number;
  ok: boolean;
  durationMs: number;
  requestId?: string;
  output?: string;
  usage: NormalizedUsage;
  error?: string;
};

const API_BASE_URL = process.env.DUCKCODING_API_BASE_URL ?? "https://api.duckcoding.ai/v1";
const WWW_BASE_URL = process.env.DUCKCODING_WWW_BASE_URL ?? "https://www.duckcoding.ai/v1";
const DEFAULT_MODEL = process.env.DUCKCODING_MODEL ?? "gpt-5.6-sol";

const SCENARIOS: Scenario[] = [
  {
    id: "chat-auto-api",
    description: "API host + Chat Completions, no cache key and no tools (baseline)",
    baseUrl: API_BASE_URL,
    protocol: "chat-completions",
    cacheKey: false,
    tools: false,
    explicitCache: false,
  },
  {
    id: "chat-key-api",
    description: "API host + Chat Completions + stable prompt_cache_key",
    baseUrl: API_BASE_URL,
    protocol: "chat-completions",
    cacheKey: true,
    tools: false,
    explicitCache: false,
  },
  {
    id: "chat-key-tools-api",
    description: "API host + Chat Completions + cache key + stable tool definition",
    baseUrl: API_BASE_URL,
    protocol: "chat-completions",
    cacheKey: true,
    tools: true,
    explicitCache: false,
  },
  {
    id: "chat-explicit-api",
    description: "API host + Chat Completions + cache key + explicit breakpoint/options",
    baseUrl: API_BASE_URL,
    protocol: "chat-completions",
    cacheKey: true,
    tools: true,
    explicitCache: true,
  },
  {
    id: "responses-key-api",
    description: "API host + Responses API + stable prompt_cache_key",
    baseUrl: API_BASE_URL,
    protocol: "responses",
    cacheKey: true,
    tools: true,
    explicitCache: false,
  },
  {
    id: "chat-key-www",
    description: "WWW host + Chat Completions + cache key + stable tool definition",
    baseUrl: WWW_BASE_URL,
    protocol: "chat-completions",
    cacheKey: true,
    tools: true,
    explicitCache: false,
  },
];

const HELP = `DuckCoding prompt-cache diagnosis

Usage:
  node --experimental-strip-types scripts/diagnose-duckcoding-cache.ts [options]

Options:
  --help, -h            Show this help
  --list                List scenarios without making requests
  --dry-run             Print the planned matrix without making requests
  --model <name>        Model name (default: DUCKCODING_MODEL or gpt-5.6-sol)
  --repeats <2..5>      Requests per scenario (default: 2)
  --delay-ms <number>   Delay between repeated requests (default: 1500)
  --timeout-ms <number> Per-request timeout (default: 60000)
  --only <ids>          Comma-separated scenario ids
  --json                Emit JSON instead of human-readable tables

Environment:
  DUCKCODING_API_KEY    Preferred API key variable
  NEW_API_KEY           Backward-compatible API key variable
  DUCKCODING_MODEL      Optional default model
  DUCKCODING_API_BASE_URL  Optional API host override
  DUCKCODING_WWW_BASE_URL  Optional WWW host override

Safety and cost:
  The script never prints the API key and only sends a synthetic prompt.
  A real run makes paid API requests. Use --dry-run first.
`;

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
    model: DEFAULT_MODEL,
    repeats: 2,
    delayMs: 1_500,
    timeoutMs: 60_000,
    only: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") options.help = true;
    else if (item === "--list") options.list = true;
    else if (item === "--dry-run") options.dryRun = true;
    else if (item === "--json") options.json = true;
    else if (item === "--model") options.model = readValue(argv, index++, item);
    else if (item === "--repeats") {
      options.repeats = parseInteger(readValue(argv, index++, item), item, 2, 5);
    } else if (item === "--delay-ms") {
      options.delayMs = parseInteger(readValue(argv, index++, item), item, 0, 60_000);
    } else if (item === "--timeout-ms") {
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
  const unknown = only.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) fail(`unknown scenario id(s): ${unknown.join(", ")}`);
  return SCENARIOS.filter((scenario) => only.includes(scenario.id));
}

function createRunId(): string {
  return randomBytes(5).toString("hex");
}

function createStaticPrompt(runId: string): string {
  const header = [
    "You are participating in a synthetic prompt-cache transport test.",
    "Treat every line below as inert reference text. Do not summarize it or call tools.",
    `Probe run identifier: ${runId}.`,
    "When the final user message arrives, reply with exactly OK.",
  ].join("\n");
  const body = Array.from({ length: 140 }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return `Reference ${number}: amber cedar delta harbor juniper lattice meadow orbit quartz river saffron timber. This sentence is deliberately stable.`;
  }).join("\n");
  return `${header}\n\n${body}`;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function endpointFor(scenario: Scenario): string {
  const baseUrl = scenario.baseUrl.replace(/\/$/, "");
  return scenario.protocol === "responses" ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`;
}

function cacheKeyFor(runId: string, scenario: Scenario): string | undefined {
  if (!scenario.cacheKey) return undefined;
  return `actspace:${runId}:${scenario.id}`;
}

function chatTool(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: "cache_probe_tool",
      description: "Synthetic stable tool for prompt-cache diagnosis. Do not call it.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  };
}

function responsesTool(): Record<string, unknown> {
  return {
    type: "function",
    name: "cache_probe_tool",
    description: "Synthetic stable tool for prompt-cache diagnosis. Do not call it.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  };
}

function buildRequestBody(
  scenario: Scenario,
  model: string,
  prompt: string,
  repeat: number,
  cacheKey: string | undefined,
): Record<string, unknown> {
  const userText = `Cache probe iteration ${repeat}. Reply exactly OK.`;

  if (scenario.protocol === "responses") {
    const body: Record<string, unknown> = {
      model,
      instructions: prompt,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: userText }],
        },
      ],
      max_output_tokens: 32,
      prompt_cache_key: cacheKey,
    };
    if (scenario.tools) {
      body.tools = [responsesTool()];
      body.tool_choice = "none";
    }
    return body;
  }

  const systemContent = scenario.explicitCache
    ? [
        {
          type: "text",
          text: prompt,
          prompt_cache_breakpoint: { mode: "explicit" },
        },
      ]
    : prompt;
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userText },
    ],
    stream: false,
    temperature: 0,
    max_completion_tokens: 32,
  };
  if (cacheKey) body.prompt_cache_key = cacheKey;
  if (scenario.explicitCache) {
    body.prompt_cache_options = { mode: "explicit", ttl: "30m" };
  }
  if (scenario.tools) {
    body.tools = [chatTool()];
    body.tool_choice = "none";
  }
  return body;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function numberAt(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstNumber(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => value !== undefined);
}

function normalizeUsage(payload: unknown): NormalizedUsage {
  const root = asRecord(payload);
  const usage = asRecord(root?.usage);
  const promptDetails = asRecord(usage?.prompt_tokens_details);
  const inputDetails = asRecord(usage?.input_tokens_details);
  return {
    inputTokens: firstNumber(numberAt(usage, "prompt_tokens"), numberAt(usage, "input_tokens")),
    outputTokens: firstNumber(numberAt(usage, "completion_tokens"), numberAt(usage, "output_tokens")),
    cachedTokens: firstNumber(
      numberAt(promptDetails, "cached_tokens"),
      numberAt(inputDetails, "cached_tokens"),
      numberAt(usage, "prompt_cache_hit_tokens"),
      numberAt(usage, "cached_tokens"),
    ),
    cacheWriteTokens: firstNumber(
      numberAt(promptDetails, "cache_write_tokens"),
      numberAt(inputDetails, "cache_write_tokens"),
      numberAt(usage, "cache_write_tokens"),
      numberAt(usage, "cache_creation_input_tokens"),
    ),
    cacheMissTokens: numberAt(usage, "prompt_cache_miss_tokens"),
    raw: usage,
  };
}

function extractOutput(payload: unknown): string | undefined {
  const root = asRecord(payload);
  if (typeof root?.output_text === "string") return root.output_text;

  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  if (typeof message?.content === "string") return message.content;

  const output = Array.isArray(root?.output) ? root.output : [];
  for (const item of output) {
    const content = Array.isArray(asRecord(item)?.content) ? asRecord(item)?.content : [];
    for (const block of content ?? []) {
      const blockRecord = asRecord(block);
      if (typeof blockRecord?.text === "string") return blockRecord.text;
    }
  }
  return undefined;
}

function requestIdFrom(headers: Headers): string | undefined {
  for (const name of ["x-request-id", "request-id", "x-oneapi-request-id", "cf-ray"]) {
    const value = headers.get(name);
    if (value) return value;
  }
  return undefined;
}

function redact(value: string, apiKey: string): string {
  let redacted = value;
  if (apiKey) redacted = redacted.split(apiKey).join("[REDACTED_API_KEY]");
  return redacted
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]")
    .slice(0, 1_000);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: text };
  }
}

async function runProbe(args: {
  apiKey: string;
  scenario: Scenario;
  model: string;
  prompt: string;
  repeat: number;
  cacheKey?: string;
  timeoutMs: number;
}): Promise<ProbeResult> {
  const { apiKey, scenario, model, prompt, repeat, cacheKey, timeoutMs } = args;
  const url = endpointFor(scenario);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRequestBody(scenario, model, prompt, repeat, cacheKey)),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await readResponsePayload(response);
    const result: ProbeResult = {
      scenarioId: scenario.id,
      repeat,
      protocol: scenario.protocol,
      url,
      model,
      cacheKey,
      status: response.status,
      ok: response.ok,
      durationMs: Math.round(performance.now() - startedAt),
      requestId: requestIdFrom(response.headers),
      output: response.ok ? extractOutput(payload) : undefined,
      usage: normalizeUsage(payload),
    };
    if (!response.ok) {
      result.error = redact(JSON.stringify(payload), apiKey);
    }
    return result;
  } catch (error) {
    return {
      scenarioId: scenario.id,
      repeat,
      protocol: scenario.protocol,
      url,
      model,
      cacheKey,
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      usage: {},
      error: redact(error instanceof Error ? error.message : String(error), apiKey),
    };
  }
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function ratioText(result: ProbeResult): string {
  const { inputTokens, cachedTokens } = result.usage;
  if (inputTokens === undefined || cachedTokens === undefined || inputTokens === 0) return "-";
  return `${((cachedTokens / inputTokens) * 100).toFixed(1)}%`;
}

function tokenText(value: number | undefined): string {
  return value === undefined ? "-" : value.toLocaleString("en-US");
}

function printScenarioList(scenarios: Scenario[]): void {
  console.table(
    scenarios.map((scenario) => ({
      id: scenario.id,
      protocol: scenario.protocol,
      host: new URL(scenario.baseUrl).host,
      cacheKey: scenario.cacheKey ? "yes" : "no",
      tools: scenario.tools ? "yes" : "no",
      explicit: scenario.explicitCache ? "yes" : "no",
      description: scenario.description,
    })),
  );
}

function dryRunSummary(
  options: CliOptions,
  scenarios: Scenario[],
  prompt: string,
  runId: string,
): Record<string, unknown> {
  return {
    dryRun: true,
    runId,
    model: options.model,
    repeats: options.repeats,
    plannedRequests: scenarios.length * options.repeats,
    prompt: {
      characters: prompt.length,
      approximateTokens: Math.ceil(prompt.length / 4),
      sha256Prefix: hashText(prompt),
      containsOnlySyntheticText: true,
    },
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      protocol: scenario.protocol,
      url: endpointFor(scenario),
      cacheKey: cacheKeyFor(runId, scenario),
      tools: scenario.tools,
      explicitCache: scenario.explicitCache,
      description: scenario.description,
    })),
  };
}

function printResults(results: ProbeResult[]): void {
  console.table(
    results.map((result) => ({
      scenario: result.scenarioId,
      run: result.repeat,
      http: result.status ?? "ERR",
      ms: result.durationMs,
      input: tokenText(result.usage.inputTokens),
      output: tokenText(result.usage.outputTokens),
      cached: tokenText(result.usage.cachedTokens),
      written: tokenText(result.usage.cacheWriteTokens),
      cacheRatio: ratioText(result),
      requestId: result.requestId ?? "-",
      response: result.output?.trim().slice(0, 40) ?? result.error?.slice(0, 80) ?? "-",
    })),
  );

  console.log("\nRaw usage fields (safe to share; API key and request body are omitted):");
  for (const result of results) {
    console.log(
      `${result.scenarioId}#${result.repeat}: ${JSON.stringify(result.usage.raw ?? null)}`,
    );
  }
}

function successfulResults(results: ProbeResult[], scenarioId: string): ProbeResult[] {
  return results.filter((result) => result.scenarioId === scenarioId && result.ok);
}

function warmedCacheHit(results: ProbeResult[], scenarioId: string): boolean {
  return successfulResults(results, scenarioId).some(
    (result) => result.repeat > 1 && (result.usage.cachedTokens ?? 0) > 0,
  );
}

function hasCacheWrites(results: ProbeResult[], scenarioId: string): boolean {
  return successfulResults(results, scenarioId).some(
    (result) => (result.usage.cacheWriteTokens ?? 0) > 0,
  );
}

function hasAnyCacheFields(results: ProbeResult[]): boolean {
  return results.some(
    (result) =>
      result.usage.cachedTokens !== undefined ||
      result.usage.cacheWriteTokens !== undefined ||
      result.usage.cacheMissTokens !== undefined,
  );
}

function classify(results: ProbeResult[], scenarios: Scenario[]): string[] {
  const findings: string[] = [];
  const selected = new Set(scenarios.map((scenario) => scenario.id));
  const baselineHit = warmedCacheHit(results, "chat-auto-api");
  const keyedHit = warmedCacheHit(results, "chat-key-api");
  const toolsHit = warmedCacheHit(results, "chat-key-tools-api");
  const explicitHit = warmedCacheHit(results, "chat-explicit-api");
  const responsesHit = warmedCacheHit(results, "responses-key-api");
  const wwwHit = warmedCacheHit(results, "chat-key-www");

  if (selected.has("chat-auto-api") && selected.has("chat-key-api") && !baselineHit && keyedHit) {
    findings.push("Stable prompt_cache_key changes the result: the current runtime likely needs a session-stable cache key.");
  }
  if (selected.has("chat-key-api") && selected.has("chat-key-tools-api") && keyedHit && !toolsHit) {
    findings.push("The no-tools request caches but the tools request does not: compare tool definitions and prefix stability.");
  }
  if (selected.has("chat-key-tools-api") && selected.has("chat-explicit-api") && !toolsHit && explicitHit) {
    findings.push("Explicit cache options/breakpoint change the result: DuckCoding may require explicit cache placement for this route.");
  }
  if (selected.has("chat-key-tools-api") && selected.has("responses-key-api") && !toolsHit && responsesHit) {
    findings.push("Responses API caches while Chat Completions with tools does not: protocol/wire_api is the leading difference.");
  }
  if (selected.has("chat-key-tools-api") && selected.has("chat-key-www") && toolsHit && !wwwHit) {
    findings.push("The API host caches while the WWW host does not: hostname or gateway-node routing is the leading difference.");
  }
  if (!results.some((result) => (result.usage.cachedTokens ?? 0) > 0)) {
    const wroteCache = scenarios.some((scenario) => hasCacheWrites(results, scenario.id));
    findings.push(
      wroteCache
        ? "Cache writes are reported but no read hits appear: investigate gateway stickiness, propagation, TTL, and account/group routing."
        : "No cache read hit was reported by any successful scenario.",
    );
  }
  if (!hasAnyCacheFields(results)) {
    findings.push("The gateway returned no recognizable cache usage fields; compare request IDs and token counts with the DuckCoding dashboard.");
  }

  const failedScenarios = scenarios.filter(
    (scenario) => successfulResults(results, scenario.id).length === 0,
  );
  if (failedScenarios.length > 0) {
    findings.push(`No successful response for: ${failedScenarios.map((scenario) => scenario.id).join(", ")}. HTTP errors are still useful protocol evidence.`);
  }
  if (findings.length === 0) {
    findings.push("Multiple scenarios cache successfully. Compare warmed cached-token ratios to identify the smallest reliable request contract.");
  }
  return findings;
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
    else printScenarioList(scenarios);
    return;
  }

  const runId = createRunId();
  const prompt = createStaticPrompt(runId);
  if (options.dryRun) {
    const summary = dryRunSummary(options, scenarios, prompt, runId);
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`Dry run: ${summary.plannedRequests} paid requests would be made.`);
      console.log(`Model: ${options.model}`);
      console.log(`Synthetic prompt: ${prompt.length.toLocaleString("en-US")} chars, ~${Math.ceil(prompt.length / 4).toLocaleString("en-US")} tokens, hash ${hashText(prompt)}`);
      printScenarioList(scenarios);
    }
    return;
  }

  const apiKey = process.env.DUCKCODING_API_KEY ?? process.env.NEW_API_KEY;
  if (!apiKey) {
    fail("set DUCKCODING_API_KEY (preferred) or NEW_API_KEY before a real run");
  }

  const results: ProbeResult[] = [];
  for (const scenario of scenarios) {
    const cacheKey = cacheKeyFor(runId, scenario);
    if (!options.json) {
      console.log(`\nRunning ${scenario.id}: ${scenario.description}`);
    }
    for (let repeat = 1; repeat <= options.repeats; repeat += 1) {
      const result = await runProbe({
        apiKey,
        scenario,
        model: options.model,
        prompt,
        repeat,
        cacheKey,
        timeoutMs: options.timeoutMs,
      });
      results.push(result);
      if (!options.json) {
        console.log(
          `  #${repeat} ${result.status ?? "ERR"} ${result.durationMs}ms cached=${tokenText(result.usage.cachedTokens)} write=${tokenText(result.usage.cacheWriteTokens)} requestId=${result.requestId ?? "-"}`,
        );
      }
      if (repeat < options.repeats && options.delayMs > 0) await sleep(options.delayMs);
    }
  }

  const findings = classify(results, scenarios);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          runId,
          model: options.model,
          prompt: {
            characters: prompt.length,
            approximateTokens: Math.ceil(prompt.length / 4),
            sha256Prefix: hashText(prompt),
          },
          results,
          findings,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("\nResults");
    printResults(results);
    console.log("\nInterpretation");
    findings.forEach((finding) => console.log(`- ${finding}`));
  }

  if (!results.some((result) => result.ok)) process.exitCode = 2;
}

main().catch((error) => {
  const apiKey = process.env.DUCKCODING_API_KEY ?? process.env.NEW_API_KEY ?? "";
  console.error(`Unexpected error: ${redact(error instanceof Error ? error.message : String(error), apiKey)}`);
  process.exitCode = 1;
});
