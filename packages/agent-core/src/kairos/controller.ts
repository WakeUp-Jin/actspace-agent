/**
 * KairosController — Kairos 域的"装配中枢"。
 *
 * 职责（plan 5 §6）：
 * 1. 拉起 ShortMemoryStore / RingBuffer / WatchDiff / SessionsDigest / BriefsIndex /
 *    BriefsDispatcher / KairosRunner / QueueProcessor。
 * 2. 暴露 start / stop / wakeNow / resetToday 控制；emit `state` / `event`。
 * 3. 主 Agent 在 runTurn 边界调 notifyMainAgentTurn{Start,End}，让 scheduler 礼让用户。
 * 4. eventSink 保证"先写盘 → 再 push ring buffer → 再回调 listener"。
 *
 * V1 简化：
 * - 不实现 configWatcher（main IPC 写入后由调用方主动 await reload()）。
 * - 不内建"内部归档 brief"——v1 由 LLM 主动写笔记+ user 手动加 brief，
 *   plan 7 e2e 再补完整 monthly/yearly archive 自维护。
 * - resetToday 把 ring buffer 清空 + ShortMemoryStore.rotateDaily。
 */
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import type {
  KairosContextMessage,
  KairosContextPromptSegment,
  KairosContextSnapshot,
  KairosContextTool,
  KairosRunState,
  KairosRuntimeState,
  LlmUsagePayload,
  SessionEvent,
} from "@actspace/shared";
import type { LLMService } from "../llm/types";
import type { ToolManager, KairosGuardContext } from "../tools/manager";
import { loadKairosConfig, type KairosConfig } from "./config/loader";
import { ShortMemoryStore } from "./storage/short-memory-store";
import { SessionEventRingBuffer } from "./storage/ring-buffer";
import { KairosUsageAccumulator } from "./storage/usage-accumulator";
import { WatchDiffEngine } from "./context/watch-diff";
import { SessionsDigestBuilder } from "./context/sessions-digest";
import { KairosShortTermMemoryContext } from "./context/short-term";
import { BriefsIndexManager } from "./briefs/index-manager";
import { BriefsDispatcher, type TickPayload } from "./briefs/dispatcher";
import { KairosRunner } from "./runner";
import { MessageQueue, QueueProcessor, type WakeReason } from "./scheduler";
import { registerKairosTools } from "./tools";
import {
  assembleSystemPrompt,
  buildHistorySummary,
  buildObservationSummary,
  derivePhase,
} from "./prompt-assembler";
import { buildConfigTipsBlock } from "./config/prompt-assembler";
import { KAIROS_SYSTEM_PROMPT } from "./prompt";
import { estimateTokens } from "../context/token-estimator";
import type { WatchDiffEntry } from "./context/watch-diff";
import type { SessionsDigestResult } from "./context/sessions-digest";
import type { KairosShortTermLoadResult } from "./context/short-term";
import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
  UserMessage,
} from "../messages";
import {
  getTextContent,
  getThinkingContent,
  getToolCalls,
} from "../messages";

/** Kairos 实例专属工具（不在主 Agent 出现）；用于 Snapshot 区分工具来源标签。 */
const KAIROS_OWN_TOOL_NAMES: ReadonlySet<string> = new Set(["sleep"]);

export interface CreateKairosOptions {
  /** `<userData>/kairos` 的绝对路径；所有子目录都基于它派生。 */
  kairosRoot: string;
  llm: LLMService;
  /**
   * 工厂：返回一个**Kairos 专属** ToolManager。
   * 调用方应在工厂内：
   *   - 注册主 Agent 同款工具集（已 minus blocklist.toolsDenied）
   *   - **不要**注册 Sleep——controller 会自己注册到该 manager 上
   */
  toolManagerFactory: (config: KairosConfig) => ToolManager;
  contextWindow: number;
  /**
   * Kairos LLM 调用是否启用思考链。由 `resolveKairosEnv()` 读 KAIROS_THINKING 决定，
   * 透传到 runner 的 loopConfig.thinkingEnabled。
   * `undefined` → 让 LLM Service 用 ModelSpec.thinkingDefault；
   * `true / false` → 显式覆盖（仅 supportsThinkingToggle 的模型生效）。
   */
  thinkingEnabled?: boolean;
  /** 自动启动后第一次 tick 的注入延迟（ms），默认 5000；测试可设 0。 */
  firstTickDelayMs?: number;
}

export interface KairosController {
  /**
   * 启动 Kairos。
   *
   * `force=false`（默认）：尊重 `preferences.enabled`——若 false 则保持 stopped 不起 processor。
   *   用于 app 启动时的"按用户偏好决定是否 auto-start"。
   * `force=true`：忽略 `preferences.enabled` 强制启动 processor。
   *   用于 UI 的"开启"按钮——这种调用本身就代表用户当下的明确意图，不应被持久化偏好挡住。
   *
   * 重复调用幂等：若已 enabled 则直接 return。
   */
  start(opts?: { force?: boolean }): Promise<void>;
  stop(): Promise<void>;
  wakeNow(): Promise<void>;
  resetToday(): Promise<void>;
  /** 让 main IPC 在用户保存 config 后调用，触发 in-place reload。 */
  reloadConfig(): Promise<KairosConfig>;
  /**
   * 持久化 `preferences.enabled` 字段到 `<kairosRoot>/config/preferences.json`，
   * 并触发 `reloadConfig()` 让内存中 `config.preferences.enabled` 同步。
   *
   * 用于方案 B：UI 的"开启 / 暂停"按钮等价于 preference——
   * 下次 app 启动时按这个字段决定 auto-start。
   *
   * 保留 preferences.json 内的其他字段（tip / sleepRangeSeconds / circuitBreaker 等），
   * 仅覆盖 enabled。如果文件不存在则创建；如果文件存在但是无效 JSON 则 throw（
   * 由 main IPC 透传到 renderer 提示用户先修文件）。
   */
  setEnabledPreference(enabled: boolean): Promise<void>;
  getState(): KairosRuntimeState;
  on(event: "state", listener: (s: KairosRuntimeState) => void): void;
  on(event: "event", listener: (e: SessionEvent) => void): void;
  off(event: "state" | "event", listener: (...args: unknown[]) => void): void;
  notifyMainAgentTurnStart(): void;
  notifyMainAgentTurnEnd(): void;
  /** 测试/调试用：返回当前 ring buffer 内事件。 */
  getRecentEvents(limit: number): SessionEvent[];
  /**
   * 按需组装上下文快照——renderer 的"上下文" Sheet 按钮触发。
   *
   * 复用 runner 的依赖（observe / shortTerm / activeBriefsCount + assembleSystemPrompt），
   * 但不真正调 LLM。即使 controller 处于 stopped 也能返回——展示的是"如果现在 tick
   * 将会看到的上下文"，不依赖 enabled 状态。
   */
  getContextSnapshot(): Promise<KairosContextSnapshot>;
}

interface ControllerLayout {
  configDir: string;
  shortMemoryDir: string;
  manifestDir: string;
  observeDir: string;
  briefsDir: string;
  notesDir: string;
  /** `usage-accumulator.json` 落地路径；与 short-term 同根，方便统一备份/清理。 */
  usageAccumulatorFile: string;
}

function layout(root: string): ControllerLayout {
  return {
    configDir: join(root, "config"),
    shortMemoryDir: join(root, "memory", "short-term"),
    manifestDir: join(root, "observe", "watch-manifests"),
    observeDir: join(root, "observe"),
    briefsDir: join(root, "briefs"),
    notesDir: join(root, "workspace", "notes"),
    usageAccumulatorFile: join(root, "memory", "usage-accumulator.json"),
  };
}

export async function createKairos(opts: CreateKairosOptions): Promise<KairosController> {
  const paths = layout(opts.kairosRoot);

  // 预创建目录（idempotent）
  await Promise.all([
    mkdir(paths.configDir, { recursive: true }),
    mkdir(paths.shortMemoryDir, { recursive: true }),
    mkdir(paths.manifestDir, { recursive: true }),
    mkdir(paths.observeDir, { recursive: true }),
    mkdir(paths.briefsDir, { recursive: true }),
    mkdir(paths.notesDir, { recursive: true }),
  ]);

  let config = await loadKairosConfig(opts.kairosRoot);

  const store = new ShortMemoryStore(paths.shortMemoryDir);
  const ringBuffer = new SessionEventRingBuffer(200);
  const usageAccumulator = new KairosUsageAccumulator({
    filePath: paths.usageAccumulatorFile,
  });
  // 启动时优先读 accumulator 文件；缺失/损坏时回退到"扫描全部短期记忆段重建 lifetime"。
  // 用户语义："除非手动删 accumulator 文件，否则 lifetime 不应该清零；持久化历史即真相。"
  // 这是冷路径（只在文件被删/损坏时跑），所以可以做全扫；正常工作流走 accumulator 文件直读。
  await usageAccumulator.load(async () => {
    const all: SessionEvent[] = [];
    const dates = await store.listAllDates();
    for (const date of dates) {
      all.push(...(await store.loadDailyAll(date)));
    }
    return all;
  });
  const shortTerm = new KairosShortTermMemoryContext({
    store,
    contextWindow: opts.contextWindow,
    loadBudgetRatio: config.preferences.memory.loadBudgetRatio,
  });
  const watchDiff = new WatchDiffEngine(paths.manifestDir);
  const sessionsDigest = new SessionsDigestBuilder({
    paths: config.paths,
    stateFile: join(paths.observeDir, "sessions-state.json"),
    outputFile: join(paths.observeDir, "sessions-digest.json"),
  });
  const briefsIndex = new BriefsIndexManager(paths.briefsDir);
  await briefsIndex.rebuildFromDisk();
  const briefsDispatcher = new BriefsDispatcher(briefsIndex);

  // Kairos 专属 ToolManager
  const toolManager = opts.toolManagerFactory(config);
  registerKairosTools(toolManager);

  const buildKairosGuard = (cfg: KairosConfig): KairosGuardContext => ({
    allowedRoots: cfg.paths.paths.map((p) => p.path),
    blocklistPaths: cfg.blocklist.paths,
    toolsDenied: cfg.blocklist.toolsDenied,
  });

  let kairosGuard = buildKairosGuard(config);

  const emitter = new EventEmitter();
  const runtimeState: KairosRuntimeState = {
    enabled: false,
    state: "stopped",
    todayTickCount: 0,
    toolCallCountInCurrentTick: 0,
    totalSleepSecondsToday: 0,
    usageLifetime: usageAccumulator.getLifetimeSummary(),
    usageSinceReset: usageAccumulator.getSinceResetSummary(),
  };
  let currentSessionDate = todayKey(new Date());

  const eventSink = async (event: SessionEvent): Promise<void> => {
    // 1) 写盘
    try {
      await store.appendEvent(event);
    } catch (err) {
      emitter.emit("error", err);
      return;                 // 写盘失败：不 push、不 emit，外层错误已记
    }
    // 2) push ring buffer
    ringBuffer.push(event);
    // 3) emit 给 IPC/UI 订阅者
    emitter.emit("event", event);

    // counters
    if (event.type === "kairos_tick_injected") {
      runtimeState.todayTickCount += 1;
      runtimeState.toolCallCountInCurrentTick = 0;
    } else if (event.type === "tool_call") {
      runtimeState.toolCallCountInCurrentTick += 1;
    } else if (event.type === "assistant_message") {
      runtimeState.lastReplyAt = event.timestamp;
    } else if (event.type === "kairos_sleep_end" || event.type === "kairos_sleep_interrupted") {
      const payload = event.payload as { actualSeconds?: number };
      if (typeof payload?.actualSeconds === "number") {
        runtimeState.totalSleepSecondsToday += payload.actualSeconds;
      }
    } else if (event.type === "llm_usage") {
      // 重要：llm_usage 已先写盘（步骤 1），这里同步累加两份维度并 debounce 落 accumulator 文件。
      // 即使 accumulator 写盘失败，下次重启会被"扫所有 jsonl 段"路径兜底重建 lifetime。
      const payload = event.payload as LlmUsagePayload | undefined;
      if (payload) {
        usageAccumulator.accumulate(payload);
        runtimeState.usageLifetime = usageAccumulator.getLifetimeSummary();
        runtimeState.usageSinceReset = usageAccumulator.getSinceResetSummary();
        // 推一次 state 让 UI 即时刷新用量胶囊；其它字段不变。
        emitter.emit("state", { ...runtimeState });
      }
    }
  };

  // 抽到 controller 顶层：runner 和 getContextSnapshot 共用，避免重复实现。
  // 注意闭包内的 `config` / `kairosGuard` 通过 reload() 整体替换；这里读它们时拿到的
  // 永远是最新一份。
  const observeRefresh = async () => {
    const watchDiffs = [];
    for (const p of config.paths.paths.filter((x) => x.watch)) {
      watchDiffs.push(await watchDiff.diff(p.path));
    }
    const sd = await sessionsDigest.refresh();
    return { watchDiffs, sessionsDigest: sd };
  };
  const activeBriefsCount = async () => {
    const entries = await briefsIndex.list();
    return entries.filter((e) => e.frontmatter.status === "active").length;
  };

  const runner = new KairosRunner({
    config,
    shortTerm,
    observeRefresh,
    activeBriefsCount,
    eventSink,
    llm: opts.llm,
    toolManager,
    kairosGuard,
    briefsIndex,
    thinkingEnabled: opts.thinkingEnabled,
  });

  const queue = new MessageQueue();

  const setState = (s: KairosRunState, meta?: { sleepEndsAt?: string; cooldownEndsAt?: string }) => {
    runtimeState.state = s;
    if (s === "sleeping") {
      runtimeState.sleepEndsAt = meta?.sleepEndsAt;
    } else {
      delete runtimeState.sleepEndsAt;
    }
    emitter.emit("state", { ...runtimeState });
  };

  const processor = new QueueProcessor({
    queue,
    runner,
    prefs: config.preferences,
    pickNextTick: (now) => briefsDispatcher.pickNext(now),
    onStateChange: setState,
    onSleepStart: async (plannedSeconds) => {
      await eventSink({
        id: makeId("evt"),
        sessionId: `kairos-${currentSessionDate}`,
        turnId: `turn-${Date.now()}`,
        type: "kairos_sleep_start",
        timestamp: new Date().toISOString(),
        schemaVersion: 1,
        payload: { plannedSeconds, reason: "after_tick" },
      });
    },
    onSleepEnd: async (info) => {
      if (info.interruptedBy) {
        await eventSink({
          id: makeId("evt"),
          sessionId: `kairos-${currentSessionDate}`,
          turnId: `turn-${Date.now()}`,
          type: "kairos_sleep_interrupted",
          timestamp: new Date().toISOString(),
          schemaVersion: 1,
          payload: { reason: info.interruptedBy, remainingSeconds: info.remainingSeconds },
        });
      } else {
        await eventSink({
          id: makeId("evt"),
          sessionId: `kairos-${currentSessionDate}`,
          turnId: `turn-${Date.now()}`,
          type: "kairos_sleep_end",
          timestamp: new Date().toISOString(),
          schemaVersion: 1,
          payload: { actualSeconds: info.actualSeconds },
        });
      }
    },
    onError: (err) => {
      void err;
      // controller 把错误也 emit 出去，main IPC 可以转推；
      // 写盘失败时 eventSink 已 swallow，这里仅做 ux 提示
      emitter.emit("scheduler-error", err);
    },
  });

  const reload = async (): Promise<KairosConfig> => {
    config = await loadKairosConfig(opts.kairosRoot);
    kairosGuard = buildKairosGuard(config);
    runner.applyConfig(config, kairosGuard);
    return config;
  };

  const firstTickDelay = opts.firstTickDelayMs ?? 5000;

  const controller: KairosController = {
    async start(opts) {
      if (runtimeState.enabled) return;
      const force = opts?.force === true;
      // 非 force 调用沿用旧语义：preferences.enabled=false → 占位 stopped 直接 return。
      // force=true（UI 显式开启）则忽略 preferences，直接进 processor。
      if (!force && !config.preferences.enabled) {
        runtimeState.enabled = false;
        setState("stopped");
        return;
      }
      runtimeState.enabled = true;
      currentSessionDate = todayKey(new Date());
      await processor.start();
      // 首次 tick：firstTickDelay 后投递一个明确的 "first wake-up" tick
      if (firstTickDelay > 0) {
        setTimeout(() => {
          queue.enqueue({
            type: "tick",
            payload: { trigger: "auto", content: "<tick first wake-up/>" },
          });
        }, firstTickDelay);
      } else {
        queue.enqueue({
          type: "tick",
          payload: { trigger: "auto", content: "<tick first wake-up/>" },
        });
      }
    },
    async stop() {
      await processor.stop();
      runtimeState.enabled = false;
      emitter.emit("state", { ...runtimeState });
    },
    async wakeNow() {
      processor.triggerWake("wake_now");
    },
    async resetToday() {
      await store.rotateDaily();
      ringBuffer.clear();
      // **只清 sinceReset 维度**，lifetime 维度保留——这是"重置今日"按钮的新产品语义：
      //   - 阶段账（sinceReset）归零，对齐 todayTickCount / totalSleepSecondsToday；
      //   - 全期账（lifetime）保留，因为它是"持久化历史的真相"，按钮不应破坏它；
      //   - 用户若真的想清 lifetime，需要手动删 usage-accumulator.json。
      await usageAccumulator.resetSinceReset();
      runtimeState.todayTickCount = 0;
      runtimeState.totalSleepSecondsToday = 0;
      runtimeState.toolCallCountInCurrentTick = 0;
      runtimeState.usageLifetime = usageAccumulator.getLifetimeSummary();
      runtimeState.usageSinceReset = usageAccumulator.getSinceResetSummary();
      currentSessionDate = todayKey(new Date());
      emitter.emit("state", { ...runtimeState });
    },
    reloadConfig: reload,
    async setEnabledPreference(enabled: boolean) {
      const prefsPath = join(opts.kairosRoot, "config", "preferences.json");
      let raw: unknown = {};
      try {
        const txt = await readFile(prefsPath, "utf8");
        raw = JSON.parse(txt);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          // 文件缺失：从空对象起步；reload 时 schema 会用默认值兜底其它字段。
          raw = {};
        } else if (err instanceof SyntaxError) {
          throw new Error(
            `preferences.json 解析失败，无法持久化 enabled=${enabled}：${err.message}（请先在编辑器里修复 JSON 语法）`,
          );
        } else {
          throw err;
        }
      }
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(
          `preferences.json 顶层必须是 object，无法持久化 enabled（请检查文件内容）`,
        );
      }
      (raw as Record<string, unknown>).enabled = enabled;
      await mkdir(dirname(prefsPath), { recursive: true });
      const tmp = `${prefsPath}.tmp`;
      await writeFile(tmp, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      await rename(tmp, prefsPath);
      await reload();
    },
    getState() {
      return { ...runtimeState };
    },
    on(event, listener) {
      emitter.on(event, listener as (...args: unknown[]) => void);
    },
    off(event, listener) {
      emitter.off(event, listener);
    },
    notifyMainAgentTurnStart() {
      processor.notifyMainAgentTurnStart();
    },
    notifyMainAgentTurnEnd() {
      processor.notifyMainAgentTurnEnd();
    },
    getRecentEvents(limit: number) {
      return ringBuffer.tail(limit);
    },
    async getContextSnapshot() {
      const now = new Date();

      // 复用 runner 同款的输入：保证"用户在 Sheet 里看到的" === "下次 tick LLM 看到的"。
      const observe = await observeRefresh();
      const shortTermResult = await shortTerm.load();
      const briefsCount = await activeBriefsCount();

      const systemPrompt = assembleSystemPrompt({
        config,
        watchDiffs: observe.watchDiffs,
        sessionsDigest: observe.sessionsDigest,
        shortTermResult,
        now,
        activeBriefsCount: briefsCount,
      });

      const systemPromptSegments = buildPromptSegments({
        now,
        config,
        configDir: paths.configDir,
        observeResult: observe,
        shortTermResult,
        briefsCount,
        promptSourceFile: "packages/agent-core/src/kairos/prompt.ts",
      });

      const tools: KairosContextTool[] = toolManager
        .getAll()
        .map<KairosContextTool>((tool) => ({
          name: tool.name,
          description: tool.description,
          source: KAIROS_OWN_TOOL_NAMES.has(tool.name) ? "kairos" : "shared",
          parametersSchema: tool.parameters,
        }))
        .sort(sortContextTool);

      const historyMessages: KairosContextMessage[] = shortTermResult.messages
        .map(messageToContextMessage)
        .filter((m): m is KairosContextMessage => m !== null);

      return {
        generatedAt: now.toISOString(),
        modelId: config.preferences.modelId ?? null,
        phase: derivePhase(now, config),
        systemPrompt,
        systemPromptTokens: estimateTokens(systemPrompt),
        systemPromptSegments,
        historySummary: shortTermResult.summarySegments.map((s) => ({
          label: s.label,
          text: s.text,
        })),
        historyMessages,
        tools,
      };
    },
  };

  return controller;
}

/**
 * Snapshot 中工具的稳定排序：Kairos 专属优先 → 名称字典序。
 * 让"主角 sleep 先出场"，方便用户看 Kairos 独有能力。
 */
function sortContextTool(a: KairosContextTool, b: KairosContextTool): number {
  if (a.source !== b.source) return a.source === "kairos" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

interface BuildPromptSegmentsInput {
  now: Date;
  config: KairosConfig;
  configDir: string;
  observeResult: {
    watchDiffs: WatchDiffEntry[];
    sessionsDigest: SessionsDigestResult;
  };
  shortTermResult: KairosShortTermLoadResult;
  briefsCount: number;
  /** 仅用于 segments 的 `sourceFiles` 标注；提交时已经是相对仓库根的路径常量。 */
  promptSourceFile: string;
}

/**
 * 把 system prompt 拆成 6 段，每段独立带 `sourceFiles`。
 *
 * 段内容必须与 `assembleSystemPrompt` 真实拼入 LLM 的内容**对应一致**——
 * - segments 各段 text 不必完整重现模板里的大标题，只关心"这一块实际写了什么"。
 * - 因此 Sheet 里复制某一段可能少模板分隔符；想拿原文用 `systemPrompt` 字段。
 */
function buildPromptSegments(input: BuildPromptSegmentsInput): KairosContextPromptSegment[] {
  const { now, config, configDir, observeResult, shortTermResult, briefsCount, promptSourceFile } = input;

  // 模板里 `# 上下文段` 之前都是硬编码段（人设 / 节奏 / Workspace boundary），
  // 用 split() 安全切出。`prompt.ts` 改了顺序也会被对应反映。
  const splitMarker = "# 上下文段";
  const [hardcodedHeader] = KAIROS_SYSTEM_PROMPT.split(splitMarker);
  const phase = derivePhase(now, config);
  const userRules = config.ruleMd.trim().length > 0 ? config.ruleMd.trim() : "（暂无 rule.md 内容）";

  const summaryPaths = Array.from(
    new Set(shortTermResult.summarySegments.map((s) => s.path).filter((p): p is string => Boolean(p))),
  );

  return [
    {
      label: "Kairos 角色与节奏",
      text: hardcodedHeader.trim(),
      sourceFiles: [promptSourceFile],
    },
    {
      label: "运行上下文",
      text: `[当前时间] ${now.toISOString()}（${phase}）\n[活跃 briefs] ${Math.max(0, briefsCount)} 个`,
    },
    {
      label: "配置提示",
      text: buildConfigTipsBlock(config),
      sourceFiles: [
        join(configDir, "paths.json"),
        join(configDir, "preferences.json"),
        join(configDir, "blocklist.json"),
      ],
    },
    {
      label: "用户规则",
      text: userRules,
      sourceFiles: [join(configDir, "rule.md")],
    },
    {
      label: "观测摘要",
      text: buildObservationSummary({
        watchDiffs: observeResult.watchDiffs,
        sessionsDigest: observeResult.sessionsDigest,
      }),
    },
    {
      label: "历史摘要",
      text: buildHistorySummary({ shortTermResult }),
      sourceFiles: summaryPaths.length > 0 ? summaryPaths : undefined,
    },
  ];
}

/**
 * `Message` → `KairosContextMessage` 投影。
 *
 * - UserMessage：直接取文本内容；保留 source 给 UI 区分（如 `kairos_tick`）。
 * - AssistantMessage：拼接 text + thinking（<thinking>…</thinking>）+ toolCall 摘要，
 *   让 Sheet 里能复原一条完整的 LLM 回合输出。
 * - ToolResultMessage：取 text 内容，role 改名为 `tool`，写上工具名前缀方便定位。
 *
 * 返回 null 时调用方过滤。 */
function messageToContextMessage(msg: Message): KairosContextMessage | null {
  if (msg.role === "user") return projectUserMessage(msg);
  if (msg.role === "assistant") return projectAssistantMessage(msg);
  if (msg.role === "toolResult") return projectToolResultMessage(msg);
  return null;
}

function projectUserMessage(msg: UserMessage): KairosContextMessage {
  const content =
    typeof msg.content === "string"
      ? msg.content
      : msg.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { text: string }).text)
          .join("");
  return {
    role: "user",
    source: msg.source,
    content,
    timestamp: toIso(msg.timestamp),
  };
}

function projectAssistantMessage(msg: AssistantMessage): KairosContextMessage {
  const parts: string[] = [];
  const thinking = getThinkingContent(msg);
  if (thinking.trim().length > 0) {
    parts.push(`<thinking>\n${thinking.trim()}\n</thinking>`);
  }
  const text = getTextContent(msg);
  if (text.trim().length > 0) parts.push(text);
  const toolCalls = getToolCalls(msg);
  for (const call of toolCalls) {
    let argsText: string;
    try {
      argsText = JSON.stringify(call.arguments);
    } catch {
      argsText = String(call.arguments);
    }
    parts.push(`[tool_call ${call.name}(${argsText})]`);
  }
  return {
    role: "assistant",
    source: msg.source,
    content: parts.join("\n\n"),
    timestamp: toIso(msg.timestamp),
  };
}

function projectToolResultMessage(msg: ToolResultMessage): KairosContextMessage {
  const body = msg.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("");
  return {
    role: "tool",
    source: msg.source,
    content: `[${msg.toolName}${msg.isError ? " · error" : ""}]\n${body}`,
    timestamp: toIso(msg.timestamp),
  };
}

function toIso(ts: number | undefined): string | undefined {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return undefined;
  return new Date(ts).toISOString();
}

function todayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}


function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
