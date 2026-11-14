// @vitest-environment node
/**
 * 上下文引擎不再每次请求复制对话（agent-spec-context-trusted-surface.md §6）：
 * 改前改后，同一段会话走一串 getContext / reconcile / toLlmInput / recordPrepared，
 * 每一步的 contextRevision、发给模型的输入、面板投影、请求记录都必须一致。
 *
 * - 会话：`fixtures/surface-derived/old-format.jsonl`（run7 父会话）转成新格式，先回放到压缩之前，
 *   再按步骤把压缩事务和压缩后的一轮追加进来。
 * - 上下文源：真实的会话源（context-conversation）、系统提示词、工具、持久补充，外加一个 status reducer；
 *   另有一个不用会话源、直接交普通对象作对话的引擎（兼容路径）。
 * - `fixtures/context-trusted/expected.json`：改前的引擎（cd0ff335）跑出的结果：每步的 revision 与各项摘要，
 *   外加最后一步的完整输入和投影（摘要不一致时用来看差在哪）。
 *   重新生成：`UPDATE_CONTEXT_TRUSTED_GOLDEN=1 pnpm vitest run src/main/test/context-trusted-equivalence.test.ts`，只在改前代码上做。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import {
  ContextEngine,
  ContextInstanceRegistry,
  ContextReducerRegistry,
  ContextSourceRegistry,
  projectContext,
  requestRecords,
  type Context,
  type ContextRequest,
  type ContextSession,
  type ContextSource,
  type ContextSupplement,
} from "@actspace/context-engine";
import { createConversationSource } from "@actspace/context-conversation";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1, SessionJournal } from "@actspace/session-journal";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { convert, readOldFixture, seedJournal } from "./surface-fixture";

const GOLDEN = join(__dirname, "fixtures", "context-trusted", "expected.json");
const COMPACTION_START = 185;

function session(journal: SessionJournal, sessionId: string): ContextSession {
  return {
    header: { sessionId },
    get lastSeq() {
      return journal.lastSeq;
    },
    get durableSeq() {
      return journal.lastSeq;
    },
    journal,
    append: async (candidate: SessionEventCandidateV1) => journal.append(candidate),
    flush: async () => undefined,
  } as unknown as ContextSession;
}

function candidateOf(event: SessionEventEnvelopeV1): SessionEventCandidateV1 {
  return {
    type: event.type,
    eventVersion: event.eventVersion,
    source: event.source,
    data: event.data,
    surface: event.surface,
    provenance: event.provenance,
  };
}

const tools = [
  {
    name: "read_file",
    definitionVersion: 1,
    definitionDigest: "d-read",
    description: "Read a file.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "bash",
    definitionVersion: 2,
    definitionDigest: "d-bash",
    description: "Run a command.",
    inputSchema: { type: "object", properties: { command: { type: "string" } } },
  },
];

function sources(): ContextSourceRegistry {
  const registry = new ContextSourceRegistry();
  registry.register(createConversationSource());
  registry.register({
    id: "golden.system",
    owner: "golden.system",
    order: 10,
    criticality: "required",
    fields: ["system"],
    cacheKey: () => "v1",
    get: (_, write) =>
      write({
        system: {
          sections: [
            { id: "identity", owner: "golden.system", order: 0, content: "You are a golden test agent." },
            { id: "rules", owner: "golden.system", order: 5, content: { rules: ["be brief", "cite paths"] } },
          ],
          modelFacts: [{ cwd: "/w" }],
        },
      }),
  } as ContextSource);
  registry.register({
    id: "golden.tools",
    owner: "golden.tools",
    order: 20,
    criticality: "required",
    fields: ["tools"],
    get: (_, write) => write({ tools }),
  } as ContextSource);
  registry.register({
    id: "golden.runtime",
    owner: "actspace.context-runtime",
    order: 30,
    criticality: "optional",
    fields: ["supplements"],
    get: (_, write) =>
      write({
        supplements: [
          {
            id: "runtime-state",
            owner: "actspace.context-runtime",
            sourceEventSeq: 0,
            afterEventSeq: -1,
            text: "Current runtime state: mode=agent; date=2026-11-07.",
          } as ContextSupplement,
        ],
      }),
  } as ContextSource);
  return registry;
}

function reducers(): ContextReducerRegistry {
  const registry = new ContextReducerRegistry();
  registry.register({
    id: "golden.tool-results",
    owner: "golden.tool-results",
    fields: ["status"],
    criticality: "required",
    reduce: ({ context, event }) =>
      event.type === "tool/result"
        ? { status: { facts: [...context.status.facts, { toolResultSeq: event.seq }] } }
        : undefined,
  });
  return registry;
}

/**
 * 生成的 instanceGeneration 是随机 UUID，比较前抹掉。
 * surface 条目上的 compactionId 是 1a300840 之后才记的（每次请求不再逐条读 surface/replaced 事件），
 * 不进 messages、manifest 和请求记录，golden 是改前代码跑出来的，所以比较时也抹掉。
 */
const IGNORED_KEYS: Record<string, unknown> = { instanceGeneration: "<generation>", compactionId: undefined };
function stable(value: unknown): string {
  return JSON.stringify(value, (key, child) => (key in IGNORED_KEYS ? IGNORED_KEYS[key] : child));
}
function plain(value: unknown): RuntimeJsonValue {
  return JSON.parse(stable(value)) as RuntimeJsonValue;
}
function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

async function run(): Promise<Record<string, RuntimeJsonValue>> {
  const { header, oldEvents } = readOldFixture();
  const events = oldEvents.map(convert);
  const journal = seedJournal(events.slice(0, COMPACTION_START), () => "2026-11-07T12:00:00.000Z");
  const contextSession = session(journal, header.sessionId);
  const instances = new ContextInstanceRegistry();
  const registry = sources();
  const reducerRegistry = reducers();
  const engine = () =>
    new ContextEngine({
      session: contextSession,
      sources: registry,
      reducers: reducerRegistry,
      instances,
      resolve: (input: ContextRequest) => ({
        request: input,
        content: {
          system: { sections: [], modelFacts: [] },
          conversation: journal.surface,
          supplements: [],
          tools: [],
        },
        status: {
          throughJournalSeq: journal.lastSeq,
          cycle: 0,
          paths: [],
          facts: [],
          plugins: { "golden.loop": { mode: "agent" } },
        },
      }),
    });

  const steps: RuntimeJsonValue[] = [];
  let last: RuntimeJsonValue = null;
  const record = async (label: string, request: ContextRequest, how: "get" | "reconcile") => {
    const current = engine();
    let context: Context =
      how === "get" ? await current.getContext(request) : await current.reconcile(request, journal.lastSeq);
    const input = await current.toLlmInput(context);
    context = await current.recordPrepared(context, {
      modelKey: `${request.routeId}/${request.model}`,
      label: request.model,
      contextWindow: 200_000,
      autoCompactAtTokens: 160_000,
    });
    const records = requestRecords(
      context,
      { sessionId: request.sessionId, routeId: input.routeId, model: input.model, tools: input.tools },
      { prepared: label } as RuntimeJsonValue,
      "composition-digest",
      "host-digest",
    );
    // 摘要按 JSON 串算，键顺序也算在内（发给 provider 的 JSON 顺序影响提示缓存）。
    steps.push({
      label,
      contextRevision: context.status.contextRevision ?? null,
      digests: {
        llmInput: digest(input),
        currentProjection: digest(projectContext(context)),
        requestProjection: digest(projectContext(context, "request")),
        requestRecords: digest(records),
      },
      messages: input.messages.length,
    });
    last = plain({ llmInput: input, currentProjection: projectContext(context) });
  };

  const base: ContextRequest = {
    sessionId: header.sessionId,
    logicalAgentScopeId: "main",
    turnId: "turn-golden-1",
    stepId: "step-1",
    requestId: "req-1",
    routeId: "default",
    model: "golden",
    options: { maxOutputTokens: 1024 },
  };
  await record("first request", base, "get");
  await record("same state, new request id", { ...base, stepId: "step-2", requestId: "req-2" }, "reconcile");
  await engine().insert(
    "actspace.context-runtime",
    "turn-note",
    "Remember to answer in Chinese.",
    "turn",
    "turn-golden-1",
  );
  await record("turn supplement inserted", { ...base, stepId: "step-3", requestId: "req-3" }, "reconcile");
  for (const event of events.slice(COMPACTION_START, COMPACTION_START + 4)) journal.append(candidateOf(event));
  await record("after compaction replace", { ...base, stepId: "step-4", requestId: "req-4" }, "reconcile");
  for (const event of events.slice(COMPACTION_START + 4)) journal.append(candidateOf(event));
  await record(
    "after new turn appended",
    { ...base, turnId: "turn-golden-2", stepId: "step-5", requestId: "req-5" },
    "reconcile",
  );
  await record(
    "same state again",
    { ...base, turnId: "turn-golden-2", stepId: "step-6", requestId: "req-6" },
    "reconcile",
  );

  // 兼容路径：不用会话源，对话是自己拼的普通对象（contextFromCandidate 内容不一致时就是这样）。
  const surface = journal.surface;
  const legacyConversation = {
    replaceGeneration: surface.replaceGeneration,
    entries: surface.entries.map((entry, index) => ({
      node: { ...entry.node, messageId: `legacy-${index}` },
      sourceEventSeqs: [] as number[],
    })),
  };
  const legacy = new ContextEngine({
    resolve: (input: ContextRequest) => ({
      request: input,
      content: {
        system: {
          sections: [{ id: "legacy-prompt", owner: "actspace.prompt", order: 0, content: "Legacy prompt." }],
          modelFacts: [],
        },
        conversation: legacyConversation,
        supplements: [],
        tools,
      },
      status: { throughJournalSeq: journal.lastSeq, cycle: 0, paths: [], facts: [], plugins: {} },
    }),
  } as never);
  const legacyContext = await legacy.getContext({ ...base, requestId: "legacy-1" });
  const legacyInput = await legacy.toLlmInput(legacyContext);

  return {
    steps: steps as RuntimeJsonValue,
    last,
    legacy: {
      contextRevision: legacyContext.status.contextRevision ?? null,
      digests: { llmInput: digest(legacyInput), projection: digest(projectContext(legacyContext)) },
    },
  };
}

it("keeps revisions, model input, panel projection and request records identical to the copying engine", async () => {
  const actual = await run();
  if (process.env.UPDATE_CONTEXT_TRUSTED_GOLDEN === "1") {
    mkdirSync(dirname(GOLDEN), { recursive: true });
    writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 1)}\n`);
  }
  expect(existsSync(GOLDEN)).toBe(true);
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8"));
  // 先比 revision 序列，失败时信息最短。
  expect((actual.steps as { contextRevision: number }[]).map((step) => step.contextRevision)).toEqual(
    (expected.steps as { contextRevision: number }[]).map((step) => step.contextRevision),
  );
  expect(actual.last).toEqual(expected.last);
  expect(actual).toEqual(expected);
});
