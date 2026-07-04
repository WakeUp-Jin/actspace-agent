/**
 * Kairos IPC 注册中心（Electron 适配层）。
 *
 * 7 个通道（plan 6 §1 契约）：
 *   invoke 通道：kairos:get-state / kairos:get-events-recent / kairos:control
 *               / kairos:read-config / kairos:write-config
 *   推送通道：kairos:event / kairos:state（main → renderer，50ms debounce 攒批）
 *
 * 本文件只负责把 ipcMain.handle + webContents.send 串到 `kairos-ipc-internals`
 * 提供的纯逻辑上：validateByName / clampLimit / KairosEventBatcher 都已在
 * internals 文件里独立可测，这里保持薄壁。
 */
import { ipcMain, Notification, type BrowserWindow } from "electron";
import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  KairosBriefDeleteRequest,
  KairosBriefDeleteResponse,
  KairosBriefReadRequest,
  KairosBriefReadResponse,
  KairosBriefWriteRequest,
  KairosBriefWriteResponse,
  KairosBriefsListResponse,
  KairosBridgeApi,
  KairosContextSnapshot,
  KairosControl,
  KairosControlResponse,
  KairosGetEventsRecentRequest,
  KairosGetEventsRecentResponse,
  KairosNotification,
  KairosNotificationsListResponse,
  KairosNotificationsMarkReadRequest,
  KairosNotificationsMarkReadResponse,
  KairosNotificationsRemoveRequest,
  KairosNotificationsRemoveResponse,
  KairosReadConfigRequest,
  KairosReadConfigResponse,
  KairosRuntimeState,
  KairosWriteConfigRequest,
  KairosWriteConfigResponse,
} from "@actspace/shared";
import type { KairosConfig, KairosController } from "@actspace/agent-core";
import {
  CONFIG_FILE_MAP,
  KAIROS_IPC_CHANNELS,
  KairosEventBatcher,
  MARKDOWN_CONFIG_NAMES,
  clampLimit,
  deleteBrief,
  dispatchKairosControl,
  listBriefs,
  readBrief,
  validateByName,
  writeBrief,
} from "./kairos-ipc-internals";

export interface RegisterKairosIpcOptions {
  controller: KairosController;
  kairosRoot: string;
  getMainWindow: () => BrowserWindow | undefined;
  /**
   * 用户保存 `preferences.json` 成功（已写盘 + reloadConfig）后回调，带上最新 KairosConfig。
   * 调用方据此做模型重建 / enabled 起停级联。
   *
   * 重要：本回调经 `setImmediate` 延后到 write-config handler 返回之后再执行——因为级联可能
   * `dispose()` 当前 kairos-ipc 句柄（重建路径会 removeHandler），不能在 invoke handler 执行
   * 过程中拆掉自己的 handler。
   */
  onPreferencesWritten?: (config: KairosConfig) => void;
}

export interface KairosIpcHandle {
  dispose(): void;
}

export { KAIROS_IPC_CHANNELS };

export function registerKairosIpc(opts: RegisterKairosIpcOptions): KairosIpcHandle {
  // ─── invoke handlers ───
  const handlers: Array<[string, (...args: unknown[]) => unknown]> = [];

  const register = <T>(channel: string, handler: (...args: unknown[]) => Promise<T> | T) => {
    ipcMain.handle(channel, async (_event, ...args) => handler(...args));
    handlers.push([channel, handler as (...args: unknown[]) => unknown]);
  };

  register("kairos:get-state", async (): Promise<KairosRuntimeState> => {
    return opts.controller.getState();
  });

  register("kairos:get-events-recent", async (...args: unknown[]): Promise<KairosGetEventsRecentResponse> => {
    const req = (args[0] as KairosGetEventsRecentRequest | undefined) ?? {};
    const limit = clampLimit(req.limit ?? 200);
    const events = opts.controller.getRecentEvents(limit);
    // v1：ring buffer 200 条对首屏够用；后续需要更早数据时再扩展 ShortMemoryStore 倒序读。
    return { events, hasMore: false };
  });

  register("kairos:control", async (...args: unknown[]): Promise<KairosControlResponse> => {
    const ctrl = args[0] as KairosControl;
    // 真实的 dispatch 逻辑（含方案 B 的 preference 持久化）在 internals 里，
    // 这里只剩一层薄壁，便于单测覆盖 dispatchKairosControl。
    // setEnabledPreference 失败（用户手编坏了 JSON）会沿 invoke 路径透传给 renderer 显示。
    await dispatchKairosControl(opts.controller, ctrl);
    return { ok: true };
  });

  register("kairos:read-config", async (...args: unknown[]): Promise<KairosReadConfigResponse> => {
    const req = args[0] as KairosReadConfigRequest;
    const fileName = CONFIG_FILE_MAP[req.name];
    if (!fileName) throw new Error(`kairos:read-config unknown name ${req.name}`);
    const filePath = join(opts.kairosRoot, "config", fileName);
    try {
      const content = await readFile(filePath, "utf8");
      return { content, fileName, notFound: false };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { content: "", fileName, notFound: true };
      throw err;
    }
  });

  register("kairos:get-context-snapshot", async (): Promise<KairosContextSnapshot> => {
    // 直接透传 controller 的实现；错误（如 watchDiff IO 失败）让 invoke 路径自然 reject，
    // 由 renderer Sheet 顶部 banner 提示用户重试。
    return opts.controller.getContextSnapshot();
  });

  register("kairos:write-config", async (...args: unknown[]): Promise<KairosWriteConfigResponse> => {
    const req = args[0] as KairosWriteConfigRequest;
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

    const filePath = join(opts.kairosRoot, "config", fileName);
    await mkdir(dirname(filePath), { recursive: true });
    // tmp 名唯一：preferences.json 同时可能被 controller.persistEnabledPreference 原子写，
    // 固定 `.tmp` 会在并发时被对方 rename 走导致 ENOENT。
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, req.content, "utf8");
    await rename(tmp, filePath);

    const reloaded = await opts.controller.reloadConfig();

    if (req.name === "preferences" && opts.onPreferencesWritten) {
      // 延后到本 handler 返回之后：级联可能重建 controller 并 dispose 当前 ipc 句柄，
      // 不能在 invoke handler 执行中拆掉自己的 handler。
      const cb = opts.onPreferencesWritten;
      setImmediate(() => cb(reloaded));
    }

    return { ok: true };
  });

  // ─── briefs（任务表）编辑通道 ───
  // 文件存取纯逻辑在 internals（可单测）；这里补两件事：
  // briefsDir 寻址（<kairosRoot>/briefs）+ 写/删成功后 reloadBriefs() 让 dispatcher 感知。
  const briefsDir = join(opts.kairosRoot, "briefs");

  register(KAIROS_IPC_CHANNELS.briefsList, async (): Promise<KairosBriefsListResponse> => {
    return listBriefs(briefsDir);
  });

  register(KAIROS_IPC_CHANNELS.briefsRead, async (...args: unknown[]): Promise<KairosBriefReadResponse> => {
    const req = args[0] as KairosBriefReadRequest;
    return readBrief(briefsDir, req.id);
  });

  register(KAIROS_IPC_CHANNELS.briefsWrite, async (...args: unknown[]): Promise<KairosBriefWriteResponse> => {
    const req = args[0] as KairosBriefWriteRequest;
    await writeBrief(briefsDir, req);
    await opts.controller.reloadBriefs();
    return { ok: true };
  });

  register(KAIROS_IPC_CHANNELS.briefsDelete, async (...args: unknown[]): Promise<KairosBriefDeleteResponse> => {
    const req = args[0] as KairosBriefDeleteRequest;
    await deleteBrief(briefsDir, req.id);
    await opts.controller.reloadBriefs();
    return { ok: true };
  });

  // ─── 通知中心（详见 docs/design-docs/agent-kairos-notifications.md） ───
  register(KAIROS_IPC_CHANNELS.notificationsList, async (): Promise<KairosNotificationsListResponse> => {
    return opts.controller.notificationsList();
  });

  register(
    KAIROS_IPC_CHANNELS.notificationsMarkRead,
    async (...args: unknown[]): Promise<KairosNotificationsMarkReadResponse> => {
      const req = (args[0] as KairosNotificationsMarkReadRequest | undefined) ?? {};
      return opts.controller.notificationsMarkRead(req.id);
    },
  );

  register(
    KAIROS_IPC_CHANNELS.notificationsRemove,
    async (...args: unknown[]): Promise<KairosNotificationsRemoveResponse> => {
      const req = args[0] as KairosNotificationsRemoveRequest | undefined;
      if (!req || (!("id" in req) && !("scope" in req))) {
        throw new Error("kairos:notifications-remove invalid payload");
      }
      return opts.controller.notificationsRemove(req);
    },
  );

  // 新通知：直发（不经 batcher——通知本身低频且需要即时徽标反馈）；
  // important 级额外弹 macOS 系统通知，点击聚焦主窗口。
  const onNotification = (n: KairosNotification) => {
    const win = opts.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(KAIROS_IPC_CHANNELS.notification, n);
    }
    if (n.level === "important" && Notification.isSupported()) {
      const osNotification = new Notification({
        title: `Kairos：${n.title}`,
        body: n.body ?? "",
      });
      osNotification.on("click", () => {
        const w = opts.getMainWindow();
        if (w && !w.isDestroyed()) {
          if (w.isMinimized()) w.restore();
          w.show();
          w.focus();
        }
      });
      osNotification.show();
    }
  };
  opts.controller.on("notification", onNotification);

  // ─── 推送：50ms debounce 攒批 ───
  const batcher = new KairosEventBatcher({
    sendEvent: (e) => opts.getMainWindow()?.webContents.send(KAIROS_IPC_CHANNELS.event, e),
    sendState: (s) => opts.getMainWindow()?.webContents.send(KAIROS_IPC_CHANNELS.state, s),
    isAlive: () => {
      const win = opts.getMainWindow();
      return Boolean(win && !win.isDestroyed());
    },
  });

  opts.controller.on("event", (e) => batcher.pushEvent(e));
  opts.controller.on("state", (s) => batcher.setState(s));

  return {
    dispose() {
      batcher.dispose();
      // notification listener 持有原始引用，直接 off——否则 dispose 后仍会弹系统通知。
      opts.controller.off("notification", onNotification as (...args: unknown[]) => void);
      // EventEmitter#off 需要传入原始 listener 引用，这里 listener 是 batcher 内部箭头，
      // dispose 后 batcher 不会再产生副作用，因此显式 off 已经无意义；
      // 保留 ipcMain.removeHandler 清理 invoke 路径即可。
      for (const [channel] of handlers) {
        ipcMain.removeHandler(channel);
      }
    },
  };
}

// 让外部仍可 import 该类型（preload 的 type-only import 不破坏）
export type KairosBridgeApiKey = keyof KairosBridgeApi;
