import type { BridgeContract, BridgeOf } from "./types";

/** bridge 与底层传输之间的最小接口：preload 接 `ipcRenderer`，renderer 的 mock bridge 接内存实现。 */
export interface BridgeTransport {
  invoke(channel: string, input?: unknown): Promise<unknown>;
  send(channel: string, input: unknown): void;
  on(channel: string, listener: (payload: unknown) => void): () => void;
}

/** `local` 成员的实现，键为「域.成员」。 */
export type LocalImplementations = Readonly<Record<string, (...args: never[]) => unknown>>;

/**
 * 按契约生成 bridge：invoke 补默认入参后转发，event 补默认 payload 后回调，send 直接发送，
 * local 取调用方（preload 或 mock）提供的实现。缺少 local 实现时直接抛错，避免暴露一个调用即崩的成员。
 */
export function buildBridge<C extends BridgeContract>(contract: C, transport: BridgeTransport, locals: LocalImplementations): BridgeOf<C> {
  const bridge: Record<string, Record<string, unknown>> = {};
  for (const [domain, members] of Object.entries(contract)) {
    const target: Record<string, unknown> = {};
    for (const [member, spec] of Object.entries(members)) {
      switch (spec.kind) {
        case "invoke": {
          const { channel, defaultInput } = spec;
          target[member] = defaultInput === undefined
            ? (input?: unknown) => transport.invoke(channel, input)
            : (input?: unknown) => transport.invoke(channel, input ?? defaultInput);
          break;
        }
        case "event": {
          const { channel, defaultPayload } = spec;
          target[member] = (listener: (payload: unknown) => void) =>
            transport.on(channel, defaultPayload === undefined ? listener : (payload) => listener(payload ?? defaultPayload));
          break;
        }
        case "send": {
          const { channel } = spec;
          target[member] = (input: unknown) => transport.send(channel, input);
          break;
        }
        case "local": {
          const implementation = locals[`${domain}.${member}`];
          if (!implementation) throw new Error(`Missing preload implementation for ${domain}.${member}`);
          target[member] = implementation;
          break;
        }
      }
    }
    bridge[domain] = Object.freeze(target);
  }
  return Object.freeze(bridge) as BridgeOf<C>;
}
