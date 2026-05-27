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
  KairosRunState,
  KairosRuntimeState,
  SessionEvent,
} from "@actspace/shared";
import type { LLMService } from "../llm/types";
import type { ToolManager, KairosGuardContext } from "../tools/manager";
import { loadKairosConfig, type KairosConfig } from "./config/loader";
import { ShortMemoryStore } from "./storage/short-memory-store";
import { SessionEventRingBuffer } from "./storage/ring-buffer";
import { WatchDiffEngine } from "./context/watch-diff";
import { SessionsDigestBuilder } from "./context/sessions-digest";
import { KairosShortTermMemoryContext } from "./context/short-term";
import { BriefsIndexManager } from "./briefs/index-manager";
import { BriefsDispatcher, type TickPayload } from "./briefs/dispatcher";
import { KairosRunner } from "./runner";
import { MessageQueue, QueueProcessor, type WakeReason } from "./scheduler";
import { registerKairosTools } from "./tools";

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
}

interface ControllerLayout {
  configDir: string;
  shortMemoryDir: string;
  manifestDir: string;
  observeDir: string;
  briefsDir: string;
  notesDir: string;
}

function layout(root: string): ControllerLayout {
  return {
    configDir: join(root, "config"),
    shortMemoryDir: join(root, "memory", "short-term"),
    manifestDir: join(root, "observe", "watch-manifests"),
    observeDir: join(root, "observe"),
    briefsDir: join(root, "briefs"),
    notesDir: join(root, "workspace", "notes"),
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
    }
  };

  const runner = new KairosRunner({
    config,
    shortTerm,
    observeRefresh: async () => {
      const watchDiffs = [];
      for (const p of config.paths.paths.filter((x) => x.watch)) {
        watchDiffs.push(await watchDiff.diff(p.path));
      }
      const sd = await sessionsDigest.refresh();
      return { watchDiffs, sessionsDigest: sd };
    },
    activeBriefsCount: async () => {
      const entries = await briefsIndex.list();
      return entries.filter((e) => e.frontmatter.status === "active").length;
    },
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
    },
    async wakeNow() {
      processor.triggerWake("wake_now");
    },
    async resetToday() {
      await store.rotateDaily();
      ringBuffer.clear();
      runtimeState.todayTickCount = 0;
      runtimeState.totalSleepSecondsToday = 0;
      runtimeState.toolCallCountInCurrentTick = 0;
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
  };

  return controller;
}

function todayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
