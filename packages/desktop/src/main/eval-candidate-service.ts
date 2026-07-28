import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  EvalCandidatePayload,
  GenerateEvalCandidateInput,
  GenerateEvalCandidateResult,
  SessionEvent,
  UserMessagePayload,
} from "@actspace/shared";
import {
  Agent,
  appendEvents,
  buildAgentConfig,
  buildAgentConfigFromRuntime,
  createAgentFromConfig,
  createPersistedSessionEvent,
  createSessionStorePaths,
  readSessionRecord,
  updateMeta,
} from "@actspace/agent-core";
import type { AppDataRoots } from "./agent-turn";
import type { ModelRuntimeService } from "./model-runtime-service";

const EVAL_CANDIDATE_SYSTEM_PROMPT = [
  "You generate a minimal regression evaluation candidate from a failed Actspace session turn.",
  "",
  "Use the existing file tools only:",
  "- read_file, list_directory, grep, and glob to inspect the supplied session file and original workspace.",
  "- write_file and edit_file to create files in the current workspace, which is the candidate directory.",
  "",
  "Required output:",
  "- case.json: one Actspace Eval Case V2 object.",
  "- fixture/: a small disposable fixture project. Always create at least one file under fixture/.",
  "",
  "case.json requirements:",
  "- schemaVersion must be 2.",
  "- source.kind must be regression-derived.",
  "- workspace.fixture must be fixture.",
  "- runtime must use permissionMode yolo and isolation docker; choose network deny unless the task truly requires network.",
  "- graders must be a non-empty subset of tool-call, execution-result, context-quality, safety-boundary, judge-final-response, judge-context-quality.",
  "- expectations must describe the smallest useful regression signal supported by the evidence.",
  "",
  "Create a minimal reproduction instead of copying the whole original project. Do not modify the original workspace. Do not read secrets or .env files. If the correct outcome cannot be inferred, create the smallest process/context regression supported by the trajectory instead of inventing a golden answer.",
].join("\n");

const DISABLED_GENERATOR_TOOLS = [
  "agent",
  "bash",
  "delete_file",
  "explore",
  "web_fetch",
  "web_search",
  "generate_image",
];

type EvalCandidateAgentRunInput = {
  candidateRoot: string;
  originalWorkspaceRoot: string;
  sessionPath: string;
  targetTurnId: string;
  originalUserInput: string;
  failureReason: string;
  model?: GenerateEvalCandidateInput["model"];
  modelKey?: GenerateEvalCandidateInput["modelKey"];
  thinkingEnabled?: boolean;
  reasoningEffort?: GenerateEvalCandidateInput["reasoningEffort"];
};

type EvalCandidateAgentRunResult = {
  modelId: string;
  finalText: string;
};

export type EvalCandidateAgentRunner = (
  input: EvalCandidateAgentRunInput,
) => Promise<EvalCandidateAgentRunResult>;

type CandidateMetadata = {
  schemaVersion: 1;
  candidateId: string;
  status: "generating" | "generated" | "failed";
  source: {
    sessionId: string;
    turnId: string;
    userInput: string;
    failureReason: string;
    capturedAt: string;
  };
  generator: {
    modelId?: string;
  };
  error?: string;
};

export async function generateEvalCandidate(
  input: GenerateEvalCandidateInput,
  roots: AppDataRoots,
  runAgent?: EvalCandidateAgentRunner,
  modelRuntime?: ModelRuntimeService,
): Promise<GenerateEvalCandidateResult> {
  const sessionPaths = createSessionStorePaths(join(roots.sessionRoot, input.sessionId));
  const record = await readSessionRecord(sessionPaths);
  const target = findLatestUserTurn(record?.events ?? []);

  if (!record?.meta || !target) {
    return persistResult(input, sessionPaths, {
      status: "failed",
      summary: "Eval candidate generation failed · no previous user turn",
      error: "The current session has no previous user turn to capture.",
    });
  }

  const candidateId = createCandidateId();
  const candidateRoot = join(roots.dataRoot, "eval-candidates", candidateId);
  const failureReason = input.reason?.trim() || "The user marked this Agent turn as failed or low quality.";
  const capturedAt = new Date().toISOString();
  const metadata: CandidateMetadata = {
    schemaVersion: 1,
    candidateId,
    status: "generating",
    source: {
      sessionId: input.sessionId,
      turnId: target.turnId,
      userInput: target.content,
      failureReason,
      capturedAt,
    },
    generator: {},
  };

  await mkdir(join(candidateRoot, "fixture"), { recursive: true });
  await writeCandidateMetadata(candidateRoot, metadata);

  try {
    const runner = runAgent ?? (modelRuntime
      ? (agentInput: EvalCandidateAgentRunInput) => runEvalCandidateAgentWithRuntime(agentInput, modelRuntime)
      : runEvalCandidateAgent);
    const generated = await runner({
      candidateRoot,
      originalWorkspaceRoot: record.meta.workspaceRoot ?? roots.defaultWorkspaceRoot,
      sessionPath: sessionPaths.sessionPath,
      targetTurnId: target.turnId,
      originalUserInput: target.content,
      failureReason,
      model: input.model,
      modelKey: input.modelKey,
      thinkingEnabled: input.thinkingEnabled,
      reasoningEffort: input.reasoningEffort,
    });
    await validateGeneratedCandidate(candidateRoot);
    await writeCandidateMetadata(candidateRoot, {
      ...metadata,
      status: "generated",
      generator: { modelId: generated.modelId },
    });

    return persistResult(input, sessionPaths, {
      candidateId,
      candidatePath: candidateRoot,
      targetTurnId: target.turnId,
      status: "generated",
      relativePath: join("eval-candidates", candidateId),
      summary: `Eval candidate generated · ${candidateRoot}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeCandidateMetadata(candidateRoot, {
      ...metadata,
      status: "failed",
      error: message,
    }).catch(() => undefined);
    return persistResult(input, sessionPaths, {
      candidateId,
      candidatePath: candidateRoot,
      targetTurnId: target.turnId,
      status: "failed",
      relativePath: join("eval-candidates", candidateId),
      summary: `Eval candidate generation failed · ${message}`,
      error: message,
    });
  }
}

async function runEvalCandidateAgent(
  input: EvalCandidateAgentRunInput,
): Promise<EvalCandidateAgentRunResult> {
  const config = buildAgentConfig(
    { model: input.model, thinkingEnabled: input.thinkingEnabled, reasoningEffort: input.reasoningEffort },
    input.candidateRoot,
    undefined,
    {
      systemPrompt: EVAL_CANDIDATE_SYSTEM_PROMPT,
      sessionId: `eval-${Date.now()}`,
      turnId: input.targetTurnId,
    },
  );
  config.toolManagerConfig.disabledTools = [
    ...new Set([
      ...(config.toolManagerConfig.disabledTools ?? []),
      ...DISABLED_GENERATOR_TOOLS,
    ]),
  ];
  const deps = createAgentFromConfig(config);
  const agent = new Agent({
    ...deps,
    toolExecution: "sequential",
    shouldStopAfterTurn: ({ turnIndex }) => turnIndex >= 12,
  });

  try {
    const finalText = await agent.runAndGetText(buildGeneratorTask(input));
    return { modelId: deps.modelKey, finalText };
  } finally {
    await deps.toolManager.dispose();
  }
}

async function runEvalCandidateAgentWithRuntime(
  input: EvalCandidateAgentRunInput,
  runtime: ModelRuntimeService,
): Promise<EvalCandidateAgentRunResult> {
  const main = runtime.resolveMainModel(input.modelKey ?? input.model);
  if ("message" in main) throw new Error(main.message);
  const utility = runtime.resolveUtilityModel(main.model);
  const explore = runtime.resolveExploreModel(main.model);
  const config = buildAgentConfigFromRuntime({
    main: { definition: main.model.definition, runtime: main.model.providerRuntime },
    ...(utility.ok && { utility: { definition: utility.model.definition, runtime: utility.model.providerRuntime } }),
    ...(explore.ok && { explore: { definition: explore.model.definition, runtime: explore.model.providerRuntime } }),
    thinkingEnabled: input.thinkingEnabled,
    reasoningEffort: input.reasoningEffort,
    toolEnvironment: runtime.getToolEnvironment(),
  }, input.candidateRoot, undefined, {
    systemPrompt: EVAL_CANDIDATE_SYSTEM_PROMPT,
    sessionId: `eval-${Date.now()}`,
    turnId: input.targetTurnId,
  });
  config.toolManagerConfig.disabledTools = [
    ...new Set([...(config.toolManagerConfig.disabledTools ?? []), ...DISABLED_GENERATOR_TOOLS]),
  ];
  const deps = createAgentFromConfig(config);
  const agent = new Agent({
    ...deps,
    toolExecution: "sequential",
    shouldStopAfterTurn: ({ turnIndex }) => turnIndex >= 12,
  });
  try {
    const finalText = await agent.runAndGetText(buildGeneratorTask(input));
    return { modelId: deps.modelKey, finalText };
  } finally {
    await deps.toolManager.dispose();
  }
}

function buildGeneratorTask(input: EvalCandidateAgentRunInput): string {
  return [
    "Generate the regression candidate now.",
    "",
    `Candidate directory: ${input.candidateRoot}`,
    `Original workspace (read only): ${input.originalWorkspaceRoot}`,
    `Session history JSONL (read only): ${input.sessionPath}`,
    `Target turn id: ${input.targetTurnId}`,
    "",
    "Original user input:",
    input.originalUserInput,
    "",
    "User-reported failure:",
    input.failureReason,
    "",
    "Read the target turn and only the workspace files needed to understand the failure. Then write case.json and a minimal fixture/ under the candidate directory. Use relative paths for every write.",
  ].join("\n");
}

function findLatestUserTurn(events: SessionEvent[]): { turnId: string; content: string } | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type !== "user_message") continue;
    const payload = event.payload as UserMessagePayload;
    if (payload.source) continue;
    if (!payload.content.trim()) continue;
    return { turnId: event.turnId, content: payload.content };
  }
  return null;
}

async function validateGeneratedCandidate(candidateRoot: string): Promise<void> {
  const casePath = join(candidateRoot, "case.json");
  const fixturePath = join(candidateRoot, "fixture");
  await access(casePath);
  const fixtureStat = await stat(fixturePath);
  if (!fixtureStat.isDirectory()) {
    throw new Error("fixture must be a directory");
  }
  if ((await readdir(fixturePath)).length === 0) {
    throw new Error("fixture must contain at least one file");
  }
  const parsed = JSON.parse(await readFile(casePath, "utf8")) as {
    schemaVersion?: unknown;
    source?: { kind?: unknown };
    workspace?: { fixture?: unknown };
    graders?: unknown;
  };
  if (parsed.schemaVersion !== 2) throw new Error("case.json must use schemaVersion 2");
  if (parsed.source?.kind !== "regression-derived") {
    throw new Error("case.json source.kind must be regression-derived");
  }
  if (parsed.workspace?.fixture !== "fixture") {
    throw new Error("case.json workspace.fixture must be fixture");
  }
  if (!Array.isArray(parsed.graders) || parsed.graders.length === 0) {
    throw new Error("case.json graders must be a non-empty array");
  }
}

async function writeCandidateMetadata(candidateRoot: string, metadata: CandidateMetadata): Promise<void> {
  await writeFile(join(candidateRoot, "candidate.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

async function persistResult(
  input: GenerateEvalCandidateInput,
  sessionPaths: ReturnType<typeof createSessionStorePaths>,
  result: {
    status: "generated" | "failed";
    summary: string;
    candidateId?: string;
    candidatePath?: string;
    targetTurnId?: string;
    relativePath?: string;
    error?: string;
  },
): Promise<GenerateEvalCandidateResult> {
  const payload: EvalCandidatePayload = {
    candidateId: result.candidateId,
    relativePath: result.relativePath,
    status: result.status,
    summary: result.summary,
    error: result.error,
  };
  const event = createPersistedSessionEvent(
    input.sessionId,
    input.turnId,
    "eval_candidate",
    payload,
  );
  const appendResult = await appendEvents(sessionPaths.sessionPath, [event]);
  if (!appendResult.ok) {
    throw new Error(appendResult.error ?? "Failed to persist eval candidate event");
  }
  const metaResult = await updateMeta(sessionPaths.metaPath, { updatedAt: new Date().toISOString() });
  if (!metaResult.ok) {
    throw new Error(metaResult.error ?? "Failed to update session metadata");
  }

  return {
    sessionId: input.sessionId,
    turnId: input.turnId,
    targetTurnId: result.targetTurnId,
    status: result.status,
    candidateId: result.candidateId,
    candidatePath: result.candidatePath,
    events: [event],
    error: result.error
      ? { code: "EVAL_CANDIDATE_GENERATION_FAILED", message: result.error }
      : undefined,
  };
}

function createCandidateId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `failure-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}
