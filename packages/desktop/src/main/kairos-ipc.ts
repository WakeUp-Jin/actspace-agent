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
import { ipcMain, type BrowserWindow } from "electron";
import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  KairosBridgeApi,
  KairosControl,
  KairosControlResponse,
  KairosGetEventsRecentRequest,
  KairosGetEventsRecentResponse,
  KairosReadConfigRequest,
  KairosReadConfigResponse,
  KairosRuntimeState,
  KairosWriteConfigRequest,
  KairosWriteConfigResponse,
} from "@actspace/shared";
import type { KairosController } from "@actspace/agent-core";
import {
  CONFIG_FILE_MAP,
  KAIROS_IPC_CHANNELS,
  KairosEventBatcher,
  clampLimit,
  dispatchKairosControl,
  validateByName,
} from "./kairos-ipc-internals";

export interface RegisterKairosIpcOptions {
  controller: KairosController;
  kairosRoot: string;
  getMainWindow: () => BrowserWindow | undefined;
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

  register("kairos:write-config", async (...args: unknown[]): Promise<KairosWriteConfigResponse> => {
    const req = args[0] as KairosWriteConfigRequest;
    const fileName = CONFIG_FILE_MAP[req.name];
    if (!fileName) throw new Error(`kairos:write-config unknown name ${req.name}`);

    if (req.name !== "rule") {
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
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, req.content, "utf8");
    await rename(tmp, filePath);

    await opts.controller.reloadConfig();

    return { ok: true };
  });

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
