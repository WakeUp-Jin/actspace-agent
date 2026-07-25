/**
 * `kairos-ipc.ts` 的纯逻辑部分。
 *
 * 这个文件**不 import electron**，所有副作用都通过依赖注入提供。
 * 单元测试可以零成本覆盖（无需 mock ipcMain / BrowserWindow），
 * `kairos-ipc.ts` 只负责把这些纯函数串到真实的 ipcMain.handle / webContents.send 上。
 */
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KairosBriefReadResponse,
  KairosBriefSummary,
  KairosBriefWriteRequest,
  KairosBriefsListResponse,
  KairosConfigName,
  KairosControl,
  KairosReadConfigRequest,
  KairosReadConfigResponse,
  KairosRuntimeState,
  KairosWriteConfigRequest,
  SessionEvent,
} from "@actspace/shared";
import {
  fullBriefMarkdown,
  parseBriefFile,
  parseBlocklist,
  parsePathsConfig,
  parsePreferences,
  type BriefDoc,
  type BriefFrontmatter,
} from "@actspace/agent-core";

/** 5 个配置文件的逻辑名 → 磁盘文件名映射。`kairos:read-config` / `write-config` 用。 */
export const CONFIG_FILE_MAP: Record<KairosConfigName, string> = {
  preferences: "preferences.json",
  paths: "paths.json",
  blocklist: "blocklist.json",
  rule: "rule.md",
  soul: "soul.md",
};

/** markdown 配置（不做 JSON schema 校验，main 直接写盘）。 */
export const MARKDOWN_CONFIG_NAMES: ReadonlySet<KairosConfigName> = new Set(["rule", "soul"]);

/**
 * `kairos:get-events-recent` 的 limit 边界处理：
 *  - 非数字 / NaN / Infinity → 默认 200
 *  - <1 → 1（至少返回一条）
 *  - >500 → 500（防 UI 一次性灌爆）
 */
export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 200;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

/**
 * `kairos:write-config` 的 schema 校验调度。
 * - rule.md / soul.md 跳过（markdown 不校验，main 直接写盘）
 * - 其余 3 份 JSON 用 agent-core 暴露的 parser；解析失败 throw 让 invoke 端 surface 给 renderer。
 */
export function validateByName(name: KairosConfigName, parsed: unknown): void {
  switch (name) {
    case "preferences":
      parsePreferences(parsed);
      return;
    case "paths":
      parsePathsConfig(parsed);
      return;
    case "blocklist":
      parseBlocklist(parsed);
      return;
    case "rule":
    case "soul":
      return;
  }
}

export async function readKairosConfigFile(
  kairosRoot: string,
  req: KairosReadConfigRequest,
): Promise<KairosReadConfigResponse> {
  const fileName = CONFIG_FILE_MAP[req.name];
  if (!fileName) throw new Error(`kairos:read-config unknown name ${req.name}`);
  const filePath = join(kairosRoot, "config", fileName);
  try {
    const content = await readFile(filePath, "utf8");
    return { content, fileName, notFound: false };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { content: "", fileName, notFound: true };
    throw err;
  }
}

export async function writeKairosConfigFile(
  kairosRoot: string,
  req: KairosWriteConfigRequest,
): Promise<void> {
  const fileName = CONFIG_FILE_MAP[req.name];
  if (!fileName) throw new Error(`kairos:write-config unknown name ${req.name}`);

  if (!MARKDOWN_CONFIG_NAMES.has(req.name)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.content);
    } catch (err) {
      throw new Error(`Invalid JSON: ${(err as Error).message}`);
    }
    validateByName(req.name, parsed);
  }

  const filePath = join(kairosRoot, "config", fileName);
  await mkdir(join(kairosRoot, "config"), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, req.content, "utf8");
  await rename(tmp, filePath);
}

// ─── briefs（任务表）文件存取 ────────────────────────────────────────────
//
// `kairos:briefs-*` 4 条通道的纯逻辑：直接读写 `<kairosRoot>/briefs/tasks/<id>.md`，
// frontmatter 解析/序列化复用 agent-core 的 parseBriefFile / fullBriefMarkdown。
// 写路径的系统字段保护（created / lastRun / nextRun 由系统维护）在这里强制执行，
// UI 无法通过 IPC 破坏调度状态。调用方（kairos-ipc.ts）在写/删成功后负责
// `controller.reloadBriefs()` 让 dispatcher 下一 tick 看到变化。

/** brief id 即文件名（不含 .md）；白名单字符防路径穿越。 */
const BRIEF_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function assertBriefId(id: string): void {
  if (!BRIEF_ID_RE.test(id)) {
    throw new Error(`Invalid brief id: ${JSON.stringify(id)}（仅限字母/数字/-/_，最长 64）`);
  }
}

function briefFilePath(briefsDir: string, id: string): string {
  assertBriefId(id);
  return join(briefsDir, "tasks", `${id}.md`);
}

function summaryFromFrontmatter(fm: BriefFrontmatter): KairosBriefSummary {
  return {
    id: fm.id,
    status: fm.status,
    trigger: fm.trigger,
    intervalSec: fm.intervalSec,
    priority: fm.priority,
    created: fm.created,
    lastRun: fm.lastRun,
    nextRun: fm.nextRun,
  };
}

export async function listBriefs(briefsDir: string): Promise<KairosBriefsListResponse> {
  const tasksDir = join(briefsDir, "tasks");
  let files: string[];
  try {
    files = await readdir(tasksDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { briefs: [] };
    throw err;
  }
  const briefs: KairosBriefSummary[] = [];
  for (const name of files) {
    if (!name.endsWith(".md")) continue;
    try {
      const doc = await parseBriefFile(join(tasksDir, name));
      briefs.push(summaryFromFrontmatter(doc.frontmatter));
    } catch {
      // 解析失败的文件跳过展示（index-manager 会把它标 failed；编辑入口以能解析的为准）
    }
  }
  briefs.sort((a, b) => a.id.localeCompare(b.id));
  return { briefs };
}

export async function readBrief(briefsDir: string, id: string): Promise<KairosBriefReadResponse> {
  const doc = await parseBriefFile(briefFilePath(briefsDir, id));
  return { summary: summaryFromFrontmatter(doc.frontmatter), body: doc.body };
}

/**
 * 新建或编辑（按 id 是否已存在区分）：
 * - 新建：created = now，lastRun / nextRun = null（首次 interval 任务由 dispatcher 立即投递）。
 * - 编辑：created / lastRun / nextRun 保留磁盘原值，只更新用户可编辑字段。
 * 原子写（tmp + rename），防止半截 frontmatter 被 index rebuild 读到。
 */
export async function writeBrief(
  briefsDir: string,
  req: KairosBriefWriteRequest,
  now: Date = new Date(),
): Promise<void> {
  const filePath = briefFilePath(briefsDir, req.id);
  if (req.trigger === "interval" && (!Number.isFinite(req.intervalSec) || (req.intervalSec ?? 0) <= 0)) {
    throw new Error("interval 触发的 brief 必须提供正数 intervalSec");
  }
  let existing: BriefDoc | null = null;
  try {
    existing = await parseBriefFile(filePath);
  } catch {
    existing = null;                       // 不存在或损坏 → 按新建处理
  }

  const frontmatter: BriefFrontmatter = {
    id: req.id,
    status: req.status,
    trigger: req.trigger,
    intervalSec: req.trigger === "interval" ? req.intervalSec : null,
    priority: req.priority,
    created: existing?.frontmatter.created ?? now.toISOString(),
    lastRun: existing?.frontmatter.lastRun ?? null,
    nextRun: existing?.frontmatter.nextRun ?? null,
  };

  await mkdir(join(briefsDir, "tasks"), { recursive: true });
  const markdown = fullBriefMarkdown({
    frontmatter,
    body: req.body,
    filePath,
    fileMtime: 0,
  });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, markdown, "utf8");
  await rename(tmp, filePath);
}

export async function deleteBrief(briefsDir: string, id: string): Promise<void> {
  await rm(briefFilePath(briefsDir, id), { force: true });
}

/** KairosEventBatcher 内部用，把 setTimeout / clearTimeout 抽出来便于测试驱动假时钟。 */
export interface BatcherTimer {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimer: BatcherTimer = {
  setTimeout: (h, ms) => setTimeout(h, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * 50ms debounce 攒批器：
 * 每次 push event / set state 后，最迟 50ms 内 flush 一次到 sink。
 * tick 内的 10+ 事件会被聚成一次 webContents.send 序列，避免 Electron IPC 抖动。
 *
 * 不绑定 Electron 任何 API；`sink.sendEvent` / `sink.sendState` 由外部注入：
 *   生产代码 → `win.webContents.send("kairos:event", e)`
 *   测试代码 → 数组 push，断言批次内容
 */
export interface BatcherSink {
  /** 主 → 渲染的事件推送。flush 时按 buffer 顺序逐条调用。 */
  sendEvent(e: SessionEvent): void;
  /** state 只保留最新一份。flush 时若有 state 缓存则调一次。 */
  sendState(s: KairosRuntimeState): void;
  /**
   * 推送前的"窗口是否还在"检查。返回 false 则 flush 直接清空 buffer 不发送，
   * 避免向已关闭的 window 写 IPC 触发 "Object has been destroyed"。
   */
  isAlive(): boolean;
}

export class KairosEventBatcher {
  private eventBuffer: SessionEvent[] = [];
  private stateBuffer: KairosRuntimeState | null = null;
  private timerHandle: unknown = null;
  private disposed = false;

  constructor(
    private readonly sink: BatcherSink,
    private readonly debounceMs = 50,
    private readonly timer: BatcherTimer = realTimer,
  ) {}

  pushEvent(e: SessionEvent): void {
    if (this.disposed) return;
    this.eventBuffer.push(e);
    this.scheduleFlush();
  }

  setState(s: KairosRuntimeState): void {
    if (this.disposed) return;
    this.stateBuffer = s;
    this.scheduleFlush();
  }

  /** 强制立即 flush（测试 / dispose 时用）。 */
  flushNow(): void {
    this.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timerHandle != null) {
      this.timer.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    this.eventBuffer = [];
    this.stateBuffer = null;
  }

  private scheduleFlush(): void {
    if (this.timerHandle != null) return;
    this.timerHandle = this.timer.setTimeout(() => this.flush(), this.debounceMs);
  }

  private flush(): void {
    this.timerHandle = null;
    if (this.disposed) return;
    if (!this.sink.isAlive()) {
      this.eventBuffer = [];
      this.stateBuffer = null;
      return;
    }
    if (this.eventBuffer.length > 0) {
      const batch = this.eventBuffer;
      this.eventBuffer = [];
      for (const e of batch) this.sink.sendEvent(e);
    }
    if (this.stateBuffer) {
      const s = this.stateBuffer;
      this.stateBuffer = null;
      this.sink.sendState(s);
    }
  }
}

/**
 * `kairos:control` 的纯逻辑分派：拿到一个 KairosControl payload，决定要调 controller 上的哪几个方法。
 *
 * 抽到 internals 是为了让"UI 开启 → start({force:true}) + setEnabledPreference(true) 同步写盘"
 * 这条契约可被单测覆盖（不需要 mock ipcMain / Electron）。
 *
 * 仅依赖一个 narrow controller 接口，方便测试用 mock 注入。
 */
export interface KairosControllerForDispatch {
  start(opts?: { force?: boolean }): Promise<void>;
  stop(): Promise<void>;
  wakeNow(): Promise<void>;
  resetToday(): Promise<void>;
  setEnabledPreference(enabled: boolean): Promise<void>;
  /** 设置页两个控件（额度开关 + 剩余额度）→ 写 budget-state.json。 */
  setBudget(input: { enabled: boolean; balanceCny: number }): Promise<void>;
}

export async function dispatchKairosControl(
  controller: KairosControllerForDispatch,
  ctrl: KairosControl,
): Promise<void> {
  if (!ctrl || typeof ctrl !== "object" || typeof (ctrl as KairosControl).type !== "string") {
    throw new Error("kairos:control invalid payload");
  }
  switch (ctrl.type) {
    case "start":
      // 方案 B：UI"开启"等价于 preference——
      // 1) force=true 立即起 processor；
      // 2) 同步把 preferences.enabled=true 写盘，让下次 app 启动自动 auto-start。
      await controller.start({ force: true });
      await controller.setEnabledPreference(true);
      return;
    case "stop":
      // 方案 B：暂停等价于"我不想它再跑"——把偏好也置 false。
      await controller.stop();
      await controller.setEnabledPreference(false);
      return;
    case "wake_now":
      await controller.wakeNow();
      return;
    case "reset_today":
      await controller.resetToday();
      return;
    case "set_budget":
      // 额度开关 + 剩余额度 → budget-state.json（不碰 preferences）。
      // controller.setBudget 内部做耗尽态清理（充值后把 budget_exhausted 拨回 stopped），
      // 但**不**自动起跑——用户改完额度仍需手动「开启」。
      await controller.setBudget({ enabled: ctrl.enabled, balanceCny: ctrl.balanceCny });
      return;
    default: {
      const _exhaustive: never = ctrl;
      void _exhaustive;
      throw new Error(`kairos:control unknown type`);
    }
  }
}

/** IPC 通道名常量集中表，避免散落字符串。 */
export const KAIROS_IPC_CHANNELS = {
  getState: "kairos:get-state",
  getEventsRecent: "kairos:get-events-recent",
  control: "kairos:control",
  readConfig: "kairos:read-config",
  writeConfig: "kairos:write-config",
  getContextSnapshot: "kairos:get-context-snapshot",
  briefsList: "kairos:briefs-list",
  briefsRead: "kairos:briefs-read",
  briefsWrite: "kairos:briefs-write",
  briefsDelete: "kairos:briefs-delete",
  notificationsList: "kairos:notifications-list",
  notificationsMarkRead: "kairos:notifications-mark-read",
  notificationsRemove: "kairos:notifications-remove",
  event: "kairos:event",
  state: "kairos:state",
  /** 推送通道：新通知实时下发（renderer 徽标 +1、列表头插）。 */
  notification: "kairos:notification",
} as const;
