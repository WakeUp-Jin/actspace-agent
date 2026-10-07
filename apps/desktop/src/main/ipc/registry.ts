import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import type { InvokeSpec, SendSpec, SpecInput, SpecOutput } from "@actspace/shared/desktop-bridge";
import { IPC_INPUT_GUARDS, type IpcGuard } from "./guards";
import { assertTrustedSender, isTrustedSender } from "./trusted-sender";

/** guard 拒绝时抛出；消息里带 channel，方便在 renderer 的报错里定位。 */
export class IpcInputError extends Error {
  override readonly name = "IpcInputError";
  constructor(readonly channel: string, reason: string) {
    super(`${reason} (${channel})`);
  }
}

export type IpcCall = { readonly channel: string; readonly input: unknown; readonly event: IpcMainInvokeEvent };
/** 按文件提供的包装钩子：远端会话路由、错误文案收口等。`next()` 调用本地 handler。 */
export type IpcMiddleware = (call: IpcCall, next: () => Promise<unknown>) => unknown;

export type IpcRegistrarOptions = {
  readonly getWindow: Parameters<typeof assertTrustedSender>[1];
  readonly untrustedMessage?: string;
  readonly middleware?: IpcMiddleware;
  /** 默认用 `IPC_INPUT_GUARDS`；测试可替换。 */
  readonly guards?: ReadonlyMap<string, IpcGuard>;
};

export type IpcRegistrar = {
  /** 注册契约中的 invoke 成员。顺序：sender 校验 → guard → middleware → handler。 */
  handle<S extends InvokeSpec<any, any>>(
    spec: S,
    handler: (input: SpecInput<S>, event: IpcMainInvokeEvent) => SpecOutput<S> | Promise<SpecOutput<S>>,
  ): void;
  /** 注册契约中的 send 成员。非信任 sender 静默忽略；入参未经校验，listener 自己判断。 */
  on<S extends SendSpec<any>>(spec: S, listener: (input: unknown, event: IpcMainEvent) => void): void;
  readonly channels: readonly string[];
  dispose(): void;
};

export function createIpcRegistrar(options: IpcRegistrarOptions): IpcRegistrar {
  const guards = options.guards ?? IPC_INPUT_GUARDS;
  const handled: string[] = [];
  const listeners: Array<readonly [string, (event: IpcMainEvent, input: unknown) => void]> = [];
  return {
    handle(spec, handler) {
      const { channel } = spec;
      const guard = guards.get(channel);
      ipcMain.handle(channel, async (event, input: unknown) => {
        assertTrustedSender(event, options.getWindow, options.untrustedMessage);
        const reason = guard?.(input);
        if (reason) throw new IpcInputError(channel, reason);
        const next = async () => handler(input as SpecInput<typeof spec>, event);
        try {
          return await (options.middleware ? options.middleware({ channel, input, event }, next) : next());
        } catch (error) {
          // Electron 只能把 Error 序列化回 renderer；其余值统一包成 Error。
          throw error instanceof Error ? error : new Error(String(error));
        }
      });
      handled.push(channel);
    },
    on(spec, listener) {
      const wrapped = (event: IpcMainEvent, input: unknown) => {
        if (!isTrustedSender(event, options.getWindow())) return;
        listener(input, event);
      };
      ipcMain.on(spec.channel, wrapped);
      listeners.push([spec.channel, wrapped]);
    },
    get channels() {
      return [...handled, ...listeners.map(([channel]) => channel)];
    },
    dispose() {
      for (const channel of handled.splice(0)) ipcMain.removeHandler(channel);
      for (const [channel, listener] of listeners.splice(0)) ipcMain.removeListener(channel, listener);
    },
  };
}
