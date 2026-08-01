/**
 * KairosController — Kairos 域的"装配中枢"。
 *
 * 职责（plan 5 §6）：
 * 1. 拉起 ShortMemoryStore / RingBuffer / SessionsDigest / BriefsIndex /
 *    BriefsDispatcher / KairosRunner / QueueProcessor。
 * 2. 暴露 start / stop / wakeNow / resetToday 控制；emit `state` / `event`。
 * 3. 主 Agent 在 runAgent 边界调 notifyMainAgentRun{Start,End}，让 scheduler 礼让用户。
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
  KairosNotification,
  KairosNotificationsListResponse,
  KairosNotificationsMarkReadResponse,
  KairosNotificationsRemoveRequest,
  KairosNotificationsRemoveResponse,
  KairosRunState,
  KairosRuntimeState,
  LlmUsagePayload,
  SessionEvent,
} from "@actspace/shared";
import { KAIROS_DEFAULT_SOUL } from "@actspace/shared";
import type { LLMService } from "../llm/types";
import type { ToolManager, KairosGuardContext } from "../tools/manager";
import { loadKairosConfig, type KairosConfig } from "./config/loader";
import { ShortMemoryStore } from "./storage/short-memory-store";
import { SessionEventRingBuffer } from "./storage/ring-buffer";
import { KairosUsageAccumulator } from "./storage/usage-accumulator";
import { KairosBudgetStore } from "./storage/budget-store";
import { KairosNotificationStore } from "./storage/notification-store";
import { SessionsDigestBuilder } from "./context/sessions-digest";
import { KairosShortTermMemoryContext } from "./context/short-term";
import { BriefsIndexManager } from "./briefs/index-manager";
import { BriefsDispatcher, type TickPayload } from "./briefs/dispatcher";
import { KairosRunner } from "./runner";
import { KairosCompressionTrigger } from "./compression/trigger";
import { MessageQueue, QueueProcessor, type WakeReason } from "./scheduler";
import { registerKairosTools } from "./tools";
import {
  commitKairosInboxReadCursor,
  loadKairosInboxReadCursor,
  loadKairosInboxSummary,
  type KairosInboxSummary,
} from "./inbox";
import {
  assembleSystemPrompt,
  assembleTickMessage,
  buildHistorySummary,
  derivePhase,
  renderKairosSkillCatalog,
  type KairosActiveBriefInfo,
  type KairosSkillCatalogEntry,
} from "./prompt-assembler";
import { buildConfigTipsBlock } from "./config/prompt-assembler";
import { KAIROS_SYSTEM_PROMPT } from "./prompt";
import { estimateTokens } from "../context/token-estimator";
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
const KAIROS_OWN_TOOL_NAMES: ReadonlySet<string> = new Set(["sleep", "notify_user"]);

export interface CreateKairosOptions {
  /** `<userData>/kairos` 的绝对路径；所有子目录都基于它派生。 */
  kairosRoot: string;
  llm: LLMService;
  /**
   * Kairos 实际使用的 provider-qualified ModelKey。仅用于
   * `getContextSnapshot().modelId` 展示——让 Sheet 里显示的模型 === LLM 真正调用的模型
   * （所见即所得）。模型可用性与默认回退已由桌面端 ModelRuntimeService 处理。
   */
  modelId: string;
  /**
   * 工厂：返回一个**Kairos 专属** ToolManager。
   * 调用方应在工厂内：
   *   - 注册主 Agent 同款工具集（已 minus blocklist.toolsDenied）
   *   - **不要**注册 Sleep——controller 会自己注册到该 manager 上
   */
  toolManagerFactory: (config: KairosConfig) => ToolManager;
  contextWindow: number;
  /**
   * Kairos LLM 调用是否启用思考链。桌面端依据当前 ModelDefinition 的能力与
   * settings.kairos.thinking 解析后，透传到 runner 的 loopConfig.thinkingEnabled。
   * `undefined` → 让 LLM Service 用 ModelSpec.thinkingDefault；
   * `true / false` → 显式覆盖（仅 supportsThinkingToggle 的模型生效）。
   */
  thinkingEnabled?: boolean;
  /** 自动启动后第一次 tick 的注入延迟（ms），默认 5000；测试可设 0。 */
  firstTickDelayMs?: number;
  /**
   * Kairos 的 Skill catalog（main 已按 `settings.kairos.enabledSkills` 白名单过滤）。
   * 作用有二：(a) 注入 system prompt 的「可用 Skills」段；
   * (b) Skill 目录并入 kairosGuard.allowedRoots，让 read_file 能读 SKILL.md / references。
   * 白名单变化时由 main 重建 controller，本实例内视为不变。
   */
  skillCatalog?: KairosSkillCatalogEntry[];
  /**
   * 额外的**只读**授权根（绝对路径）——当前来源是 fs-watch 插件正在监听的目录：
   * 用户把目录加入文件监听，即代表"允许 Kairos 阅读该目录"，Kairos 才能对
   * fs-watch 报告的变化用 read_file 看细节。
   * 只并入 guard.readOnlyRoots（写工具不放行）；监听目录变化时由 main 重建 controller。
   */
  readOnlyRoots?: string[];
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
   * 让 main IPC 在用户通过设置页新建/编辑/删除 brief 后调用：
   * 全量重扫 `briefs/tasks/*.md` 重建 index，dispatcher 下一 tick 即可看到变化。
   */
  reloadBriefs(): Promise<void>;
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
  /**
   * 设置页「额度限制」开关 + 「剩余额度」输入 → 写 `memory/budget-state.json`，
   * 刷新运行态 budget，并清理 `budget_exhausted` 态（若充值后余额 > 0 / 关掉开关）。
   * **不自动起跑**——恢复运行需用户手动点「开启」。
   */
  setBudget(input: { enabled: boolean; balanceCny: number }): Promise<void>;
  /**
   * 退出统一入口：abort 正在飞的 LLM 请求 → 停循环 → flush usage / budget 写盘。
   * 内部各步骤独立吞错，保证整体不抛（main 的 before-quit 依赖它一定 resolve）。
   */
  shutdown(): Promise<void>;
  getState(): KairosRuntimeState;
  /** 通知中心：全量列表（新→旧）+ 未读数。 */
  notificationsList(): KairosNotificationsListResponse;
  /** 标记已读；`id` 省略 = 全部已读。返回最新未读数。 */
  notificationsMarkRead(id?: string): Promise<KairosNotificationsMarkReadResponse>;
  /** 删除通知（单条 / 清除已读 / 清空全部）；纯用户侧操作。 */
  notificationsRemove(
    req: KairosNotificationsRemoveRequest,
  ): Promise<KairosNotificationsRemoveResponse>;
  on(event: "state", listener: (s: KairosRuntimeState) => void): void;
  on(event: "event", listener: (e: SessionEvent) => void): void;
  on(event: "notification", listener: (n: KairosNotification) => void): void;
  off(event: "state" | "event" | "notification", listener: (...args: unknown[]) => void): void;
  notifyMainAgentRunStart(): void;
  notifyMainAgentRunEnd(): void;
  /** 测试/调试用：返回当前 ring buffer 内事件。 */
  getRecentEvents(limit: number): SessionEvent[];
  /**
   * 按需组装上下文快照——renderer 的"上下文" Sheet 按钮触发。
   *
   * 复用 runner 的依赖（observe / shortTerm / activeBriefs + assembleSystemPrompt），
   * 但不真正调 LLM。即使 controller 处于 stopped 也能返回——展示的是"如果现在 tick
   * 将会看到的上下文"，不依赖 enabled 状态。
   */
  getContextSnapshot(): Promise<KairosContextSnapshot>;
}

interface ControllerLayout {
  configDir: string;
  shortMemoryDir: string;
  observeDir: string;
  briefsDir: string;
  notesDir: string;
  /** `usage-accumulator.json` 落地路径；与 short-term 同根，方便统一备份/清理。 */
  usageAccumulatorFile: string;
  /** `budget-state.json` 落地路径（额度护栏单一余额运行态）。 */
  budgetStateFile: string;
  /** `notifications.json` 落地路径（通知中心，含可变已读状态）。 */
  notificationsFile: string;
}

function layout(root: string): ControllerLayout {
  return {
    configDir: join(root, "config"),
    shortMemoryDir: join(root, "memory", "short-term"),
    observeDir: join(root, "observe"),
    briefsDir: join(root, "briefs"),
    notesDir: join(root, "workspace", "notes"),
    usageAccumulatorFile: join(root, "memory", "usage-accumulator.json"),
    budgetStateFile: join(root, "memory", "budget-state.json"),
    notificationsFile: join(root, "memory", "notifications.json"),
  };
}

export async function createKairos(opts: CreateKairosOptions): Promise<KairosController> {
  const paths = layout(opts.kairosRoot);

  // 预创建目录（idempotent）
  await Promise.all([
    mkdir(paths.configDir, { recursive: true }),
    mkdir(paths.shortMemoryDir, { recursive: true }),
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
  // 额度护栏单一余额：与 usage-accumulator 独立（后者是只增的统计总账，前者是可扣减的余额）。
  const budgetStore = new KairosBudgetStore({ filePath: paths.budgetStateFile });
  await budgetStore.load();
  // 中断正在飞的 LLM 请求用；每次 start() 重建，shutdown()/耗尽时 abort。
  let abortController = new AbortController();
  const shortTerm = new KairosShortTermMemoryContext({
    store,
    contextWindow: opts.contextWindow,
    loadBudgetRatio: config.preferences.memory.loadBudgetRatio,
  });
  const sessionsDigest = new SessionsDigestBuilder({
    paths: config.paths,
    stateFile: join(paths.observeDir, "sessions-state.json"),
    outputFile: join(paths.observeDir, "sessions-digest.json"),
  });
  const briefsIndex = new BriefsIndexManager(paths.briefsDir);
  await briefsIndex.rebuildFromDisk();
  const briefsDispatcher = new BriefsDispatcher(briefsIndex);

  // 通知中心：notify_user 工具写入，UI 铃铛读取；防刷计数每 tick 清零（见 eventSink）。
  const notificationStore = new KairosNotificationStore(paths.notificationsFile);
  await notificationStore.load();
  let tickNotifyCount = 0;

  // Kairos 专属 ToolManager
  const toolManager = opts.toolManagerFactory(config);
  registerKairosTools(toolManager, {
    notify: {
      store: notificationStore,
      getTickNotifyCount: () => tickNotifyCount,
      incTickNotifyCount: () => {
        tickNotifyCount += 1;
      },
    },
  });

  const skillCatalog = opts.skillCatalog ?? [];
  const buildKairosGuard = (cfg: KairosConfig): KairosGuardContext => ({
    // 可读可写：paths.json 声明的路径（默认只有 Kairos 自己的 workspace）。
    allowedRoots: cfg.paths.paths.map((p) => p.path),
    // 只读授权：Skill 目录（catalog 段告诉 Kairos 去读 SKILL.md / references，
    // guard 必须放行）+ fs-watch 监听目录（用户加入监听即授权阅读）
    // + briefs 目录（Kairos 可以翻自己的任务表原文，但任务是用户定的，不给写）。
    readOnlyRoots: [
      ...skillCatalog.map((s) => s.directory),
      paths.briefsDir,
      ...(opts.readOnlyRoots ?? []),
    ],
    blocklistPaths: cfg.blocklist.paths,
    toolsDenied: cfg.blocklist.toolsDenied,
  });

  let kairosGuard = buildKairosGuard(config);

  const emitter = new EventEmitter();
  // 新通知 → 对外 emit，kairos-ipc 转发 renderer（徽标 +1）+ important 级弹系统通知。
  notificationStore.onCreated((n) => {
    emitter.emit("notification", n);
  });
  const runtimeState: KairosRuntimeState = {
    enabled: false,
    state: "stopped",
    budget: budgetStore.getRuntime(),
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
      tickNotifyCount = 0;
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
        // 额度护栏：开关开时把本次成本从余额扣减；扣到 ≤0 提前唤醒，让 loop 在
        // 下个 tick 边界被 canStartTick 拦下（避免长 sleep 期间还显示 sleeping）。
        if (budgetStore.getEnabled()) {
          budgetStore.deduct(payload.cost?.total ?? 0);
          runtimeState.budget = budgetStore.getRuntime();
          if (runtimeState.budget.exhausted) {
            processor.triggerWake("wake_now");
          }
        }
        // 推一次 state 让 UI 即时刷新用量胶囊 / 余额；其它字段不变。
        emitter.emit("state", { ...runtimeState });
      }
    }
  };

  // 抽到 controller 顶层：runner 和 getContextSnapshot 共用，避免重复实现。
  // 注意闭包内的 `config` / `kairosGuard` 通过 reload() 整体替换；这里读它们时拿到的
  // 永远是最新一份。
  //
  // 计算与提交分离：observeRefresh 只读不写游标；返回的 commit 闭包由 runner 在
  // tick 正常闭合后调用。getContextSnapshot 只 compute 不 commit——
  // 用户打开上下文 Sheet 不会"看一眼就吃掉观测增量"。
  const inboxStateFile = join(paths.observeDir, "inbox-state.json");
  const observeRefresh = async () => {
    const sd = await sessionsDigest.refresh();
    const commit = async () => {
      await sessionsDigest.commitCursor(sd.cursor);
    };
    return { sessionsDigest: sd, commit };
  };
  const activeBriefs = async () => {
    const entries = await briefsIndex.list();
    return entries
      .filter((e) => e.frontmatter.status === "active")
      .map((e) => ({ id: e.id, nextRun: e.frontmatter.nextRun }));
  };
  const loadInboxSummary = async () => {
    const readCursor = await loadKairosInboxReadCursor(inboxStateFile);
    return loadKairosInboxSummary({ kairosRoot: opts.kairosRoot, readCursor });
  };
  const commitInboxCursor = (summary: KairosInboxSummary) =>
    commitKairosInboxReadCursor(inboxStateFile, summary);

  // 短期记忆压缩触发器：tick 闭合（onSleepStart）后异步判定阈值并压缩，
  // 失败仅 emit warning，不阻塞调度循环。
  const compressionTrigger = new KairosCompressionTrigger({
    store,
    shortTerm,
    llm: opts.llm,
    contextWindow: opts.contextWindow,
    getCompressionThreshold: () => config.preferences.memory.compressionThreshold,
    emitCompactionEvent: (payload) =>
      eventSink({
        id: makeId("evt"),
        sessionId: `kairos-${currentSessionDate}`,
        agentRunId: `turn-${Date.now()}`,
        type: "context_compaction",
        timestamp: new Date().toISOString(),
        schemaVersion: 2,
        payload,
      }),
    onWarning: (message, cause) => {
      emitter.emit("error", new Error(message, cause ? { cause } : undefined));
    },
    getAbortSignal: () => abortController.signal,
  });

  const runner = new KairosRunner({
    config,
    shortTerm,
    skillCatalog,
    observeRefresh,
    activeBriefs,
    loadInboxSummary,
    commitInboxCursor,
    eventSink,
    llm: opts.llm,
    toolManager,
    kairosGuard,
    briefsIndex,
    thinkingEnabled: opts.thinkingEnabled,
    getAbortSignal: () => abortController.signal,
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

  /**
   * merge-write `preferences.json` 的 `enabled` 字段（保留其它字段）+ reload。
   * 被 controller.setEnabledPreference 和耗尽暂停 haltForBudget 复用。
   *
   * 写入串行化 + tmp 名唯一：曾因固定 `.tmp` 路径在快速连点开启/暂停时并发写，
   * 先完成的 rename 把共享 tmp 挪走，后一个 rename 直接 ENOENT（UI 表现为暂停失效）。
   */
  let prefsWriteChain: Promise<void> = Promise.resolve();
  const persistEnabledPreference = (enabled: boolean): Promise<void> => {
    const next = prefsWriteChain.then(
      () => persistEnabledPreferenceUnsafe(enabled),
      () => persistEnabledPreferenceUnsafe(enabled),
    );
    // 队列本身吞掉错误避免链条中断；调用方仍通过返回的 next 感知失败。
    prefsWriteChain = next.catch(() => {});
    return next;
  };
  const persistEnabledPreferenceUnsafe = async (enabled: boolean): Promise<void> => {
    const prefsPath = join(opts.kairosRoot, "config", "preferences.json");
    let raw: unknown = {};
    try {
      const txt = await readFile(prefsPath, "utf8");
      raw = JSON.parse(txt);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
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
      throw new Error(`preferences.json 顶层必须是 object，无法持久化 enabled（请检查文件内容）`);
    }
    (raw as Record<string, unknown>).enabled = enabled;
    await mkdir(dirname(prefsPath), { recursive: true });
    const tmp = `${prefsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
    await rename(tmp, prefsPath);
    await reload();
  };

  /**
   * 余额耗尽暂停：scheduler 在 tick 边界检测到余额 ≤0 → loop 切 budget_exhausted 并退出，
   * 这里补做副作用：总开关 enabled=false + 持久化 preferences.enabled=false（避免重启反复
   * 撞墙）+ 落一条 error 事件让用户在执行列表看到原因。**不自动恢复**——用户充值后手动开启。
   */
  const haltForBudget = async (): Promise<void> => {
    runtimeState.enabled = false;
    try {
      await persistEnabledPreference(false);
    } catch (err) {
      emitter.emit("error", err);
    }
    try {
      await eventSink({
        id: makeId("evt"),
        sessionId: `kairos-${currentSessionDate}`,
        agentRunId: `turn-${Date.now()}`,
        type: "error",
        timestamp: new Date().toISOString(),
        schemaVersion: 2,
        payload: { message: "额度不足，Kairos 已暂停。请在设置页调高剩余额度后重新开启。" },
      });
    } catch {
      // 写盘失败不影响暂停本身
    }
    emitter.emit("state", { ...runtimeState });
  };

  /**
   * 传给 scheduler 的状态回调：在普通 setState 基础上，捕获"刚进入 budget_exhausted"的
   * 转换并触发 haltForBudget（仅 scheduler 驱动的被动耗尽走这条；start 的防御性检查不复触发）。
   */
  const handleSchedulerState = (s: KairosRunState, meta?: { sleepEndsAt?: string; cooldownEndsAt?: string }) => {
    const enteringExhausted = s === "budget_exhausted" && runtimeState.state !== "budget_exhausted";
    setState(s, meta);
    if (enteringExhausted) void haltForBudget();
  };

  const processor = new QueueProcessor({
    queue,
    runner,
    prefs: config.preferences,
    pickNextTick: (now) => briefsDispatcher.pickNext(now),
    canStartTick: () => !budgetStore.getRuntime().exhausted,
    onStateChange: handleSchedulerState,
    onSleepStart: async (plannedSeconds) => {
      await eventSink({
        id: makeId("evt"),
        sessionId: `kairos-${currentSessionDate}`,
        agentRunId: `turn-${Date.now()}`,
        type: "kairos_sleep_start",
        timestamp: new Date().toISOString(),
        schemaVersion: 2,
        payload: { plannedSeconds, reason: "after_tick" },
      });
      // tick 已闭合、进入睡眠期——后台检查压缩阈值（fire-and-forget）
      compressionTrigger.maybeCompressInBackground();
    },
    onSleepEnd: async (info) => {
      if (info.interruptedBy) {
        await eventSink({
          id: makeId("evt"),
          sessionId: `kairos-${currentSessionDate}`,
          agentRunId: `turn-${Date.now()}`,
          type: "kairos_sleep_interrupted",
          timestamp: new Date().toISOString(),
          schemaVersion: 2,
          payload: { reason: info.interruptedBy, remainingSeconds: info.remainingSeconds },
        });
      } else {
        await eventSink({
          id: makeId("evt"),
          sessionId: `kairos-${currentSessionDate}`,
          agentRunId: `turn-${Date.now()}`,
          type: "kairos_sleep_end",
          timestamp: new Date().toISOString(),
          schemaVersion: 2,
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
      // 幂等：已在跑就返回。但 budget_exhausted 是"被动暂停"（enabled 已被置 false），
      // 必须允许从这里重新开启，所以显式排除该状态。
      if (runtimeState.enabled && runtimeState.state !== "budget_exhausted") return;
      const force = opts?.force === true;
      // 非 force 调用沿用旧语义：preferences.enabled=false → 占位 stopped 直接 return。
      // force=true（UI 显式开启）则忽略 preferences，直接进 processor。
      if (!force && !config.preferences.enabled) {
        runtimeState.enabled = false;
        setState("stopped");
        return;
      }
      // 额度防御：余额耗尽时不起 processor，抛错让 renderer toast 提示先充值。
      if (budgetStore.getRuntime().exhausted) {
        runtimeState.enabled = false;
        setState("budget_exhausted");
        throw new Error("额度不足，请先在设置页调高剩余额度后再开启。");
      }
      runtimeState.enabled = true;
      // 每轮启动重建中断句柄，供 shutdown() abort 正在飞的 LLM 请求。
      abortController = new AbortController();
      const startNow = new Date();
      currentSessionDate = todayKey(startNow);
      await processor.start();
      // 首个 tick：firstTickDelay 后投递。"first wake-up" 标记只在今天（当前分卷）
      // 还没有任何短期记忆时携带——settings 变更引发的 controller rebuild 会反复走
      // start()，若无条件带标记，Kairos 会在一天内收到多个"首次唤醒"（模型会困惑并
      // 重复勘察）。已有今日记忆时说明环境是熟悉的，投普通 tick 即可。
      const isFirstWakeUpToday = (await store.loadDaily(currentSessionDate)).length === 0;
      const firstTickContent = isFirstWakeUpToday ? "<tick first wake-up/>" : "";
      if (firstTickDelay > 0) {
        setTimeout(() => {
          queue.enqueue({
            type: "tick",
            payload: { trigger: "auto", content: firstTickContent },
          });
        }, firstTickDelay);
      } else {
        queue.enqueue({
          type: "tick",
          payload: { trigger: "auto", content: firstTickContent },
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
    async reloadBriefs() {
      await briefsIndex.rebuildFromDisk();
    },
    async setEnabledPreference(enabled: boolean) {
      await persistEnabledPreference(enabled);
    },
    async setBudget(input) {
      await budgetStore.setBudget({ enabled: input.enabled, balanceCny: input.balanceCny });
      runtimeState.budget = budgetStore.getRuntime();
      // 耗尽态清理：充值后余额 > 0 / 关掉开关 → 从被动暂停回 stopped，UI 不再显示"额度不足"，
      // 用户点「开启」即可正常进 idle。仍 exhausted（如设了 enabled 但 balance=0）则保持。
      if (runtimeState.state === "budget_exhausted" && !runtimeState.budget.exhausted) {
        setState("stopped");
      } else {
        emitter.emit("state", { ...runtimeState });
      }
    },
    async shutdown() {
      // 1) 中断正在飞的 LLM 请求，让当前 tick 尽快返回。
      try {
        abortController.abort();
      } catch {
        // ignore
      }
      // 2) 停循环（等当前 tick 自然收尾）。
      try {
        await processor.stop();
      } catch {
        // ignore
      }
      runtimeState.enabled = false;
      // 3) flush 两个运行态文件，避免退出丢账 / 丢余额。
      try {
        await usageAccumulator.flush();
      } catch {
        // ignore
      }
      try {
        await budgetStore.flush();
      } catch {
        // ignore
      }
    },
    getState() {
      return { ...runtimeState };
    },
    notificationsList() {
      return {
        notifications: notificationStore.list(),
        unreadCount: notificationStore.unreadCount(),
      };
    },
    async notificationsMarkRead(id?: string) {
      const unreadCount = await notificationStore.markRead(id);
      return { ok: true as const, unreadCount };
    },
    async notificationsRemove(req) {
      const removedCount = await notificationStore.remove(req);
      return { ok: true as const, removedCount, unreadCount: notificationStore.unreadCount() };
    },
    on(event, listener) {
      emitter.on(event, listener as (...args: unknown[]) => void);
    },
    off(event, listener) {
      emitter.off(event, listener);
    },
    notifyMainAgentRunStart() {
      processor.notifyMainAgentRunStart();
    },
    notifyMainAgentRunEnd() {
      processor.notifyMainAgentRunEnd();
    },
    getRecentEvents(limit: number) {
      return ringBuffer.tail(limit);
    },
    async getContextSnapshot() {
      const now = new Date();

      // 复用 runner 同款的输入：保证"用户在 Sheet 里看到的" === "下次 tick LLM 看到的"。
      const observe = await observeRefresh();
      const shortTermResult = await shortTerm.load();
      const briefs = await activeBriefs();
      const inboxSummary = await loadInboxSummary();

      const systemPrompt = assembleSystemPrompt({
        config,
        shortTermResult,
        skillCatalog,
      });

      const systemPromptSegments = buildPromptSegments({
        now,
        config,
        configDir: paths.configDir,
        observeResult: observe,
        inboxSummary,
        shortTermResult,
        briefs,
        skillCatalog,
        promptSourceFile: "packages/agent-core/src/kairos/prompt.ts",
      });

      const tools: KairosContextTool[] = toolManager
        .getToolDefinitions()
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
        // 真实解析后的模型 id（来源 settings.kairos.modelId，已回落默认）；不再读裸字段，
        // 保证显示 === 实际调用的模型。
        modelId: opts.modelId,
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
    sessionsDigest: SessionsDigestResult;
  };
  inboxSummary?: KairosInboxSummary;
  shortTermResult: KairosShortTermLoadResult;
  briefs: KairosActiveBriefInfo[];
  skillCatalog: KairosSkillCatalogEntry[];
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
  const { now, config, configDir, observeResult, shortTermResult, briefs, promptSourceFile } = input;

  // 模板里 `# 上下文段` 之前是身份段（{soul} 插槽）+ 机制段（例程 / 场景应对 /
  // Workspace boundary），用 split() 安全切出。`prompt.ts` 改了顺序也会被对应反映。
  // {soul} 按 assembleSystemPrompt 同款规则替换，保证 Sheet 预览 === LLM 实际所见。
  const splitMarker = "# 上下文段";
  const [rawHeader] = KAIROS_SYSTEM_PROMPT.split(splitMarker);
  const effectiveSoul = config.soulMd.trim().length > 0 ? config.soulMd.trim() : KAIROS_DEFAULT_SOUL;
  const hardcodedHeader = rawHeader.replace("{soul}", effectiveSoul);
  const phase = derivePhase(now, config);
  const userRules = config.ruleMd.trim().length > 0 ? config.ruleMd.trim() : "（暂无 rule.md 内容）";

  const summaryPaths = Array.from(
    new Set(shortTermResult.summarySegments.map((s) => s.path).filter((p): p is string => Boolean(p))),
  );

  return [
    {
      label: "Kairos 角色与节奏",
      text: hardcodedHeader.trim(),
      // soul.md 是用户可改的人格插槽；prompt.ts 是机制段来源。
      sourceFiles: [join(configDir, "soul.md"), promptSourceFile],
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
      label: "可用 Skills",
      text: renderKairosSkillCatalog(input.skillCatalog),
      sourceFiles: input.skillCatalog.length > 0 ? input.skillCatalog.map((s) => s.location) : undefined,
    },
    {
      label: "用户规则",
      text: userRules,
      sourceFiles: [join(configDir, "rule.md")],
    },
    {
      label: "历史摘要",
      text: buildHistorySummary({ shortTermResult }),
      sourceFiles: summaryPaths.length > 0 ? summaryPaths : undefined,
    },
    // 以下内容不在 system prompt 里——每 tick 拼进 tick user message（动态尾部），
    // 这里预览"下个 tick 注入时 LLM 会看到什么"。
    {
      label: "下个 tick 注入（动态尾部）",
      text: assembleTickMessage({
        now,
        phase,
        activeBriefs: briefs,
        sessionsDigest: observeResult.sessionsDigest,
        inboxSummary: input.inboxSummary,
      }),
      sourceFiles: input.inboxSummary?.files.map((f) => f.path),
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
