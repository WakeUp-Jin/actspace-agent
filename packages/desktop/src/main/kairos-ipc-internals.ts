/**
 * `kairos-ipc.ts` 的纯逻辑部分。
 *
 * 这个文件**不 import electron**，所有副作用都通过依赖注入提供。
 * 单元测试可以零成本覆盖（无需 mock ipcMain / BrowserWindow），
 * `kairos-ipc.ts` 只负责把这些纯函数串到真实的 ipcMain.handle / webContents.send 上。
 */
import type {
  KairosConfigName,
  KairosControl,
  KairosRuntimeState,
  SessionEvent,
} from "@actspace/shared";
import { parseBlocklist, parsePathsConfig, parsePreferences } from "@actspace/agent-core";

/** 4 个配置文件的逻辑名 → 磁盘文件名映射。`kairos:read-config` / `write-config` 用。 */
export const CONFIG_FILE_MAP: Record<KairosConfigName, string> = {
  preferences: "preferences.json",
  paths: "paths.json",
  blocklist: "blocklist.json",
  rule: "rule.md",
};

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
 * - rule.md 跳过（markdown 不校验，main 直接写盘）
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
      return;
  }
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
  event: "kairos:event",
  state: "kairos:state",
} as const;
