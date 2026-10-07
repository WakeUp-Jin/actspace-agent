import {
  buildBridge,
  desktopBridgeContract,
  type BridgeSpec,
  type BridgeTransport,
  type DesktopBridge,
} from "@actspace/shared/desktop-bridge";
import type { MockClock, MockEventName, MockEventPayload } from "./clock";
import { defaultHandlers, type MockHandlers } from "./handlers";
import { createMockDb, type MockDb } from "./mock-db";
import { MOCK_SCENARIOS, type MockScenario } from "./scenarios";

export type { MockHandlers } from "./handlers";
export type { MockScenario } from "./scenarios";

export type MockBridgeHandle = {
  readonly bridge: DesktopBridge;
  readonly db: MockDb;
  emit<E extends MockEventName>(event: E, payload: MockEventPayload<E>): void;
  /** 在已安装的 bridge 上追加覆盖：之后的调用走新实现，已建立的事件订阅不受影响。 */
  override(handlers: MockHandlers): void;
  /** 清掉场景和回放留下的计时器、事件订阅。 */
  dispose(): void;
};

export type CreateMockBridgeOptions = {
  readonly scenario?: MockScenario;
  /** 覆盖默认实现；测试里用它替换关心的成员。 */
  readonly handlers?: MockHandlers;
};

type Route = { readonly domain: string; readonly member: string };
type HandlerTable = Record<string, Record<string, ((...args: never[]) => unknown) | undefined> | undefined>;

const routes = new Map<string, Route>();
const contractDomains = desktopBridgeContract as unknown as Record<string, Record<string, BridgeSpec>>;
for (const [domain, members] of Object.entries(contractDomains)) {
  for (const [member, spec] of Object.entries(members)) {
    if ("channel" in spec) routes.set(spec.channel, { domain, member });
  }
}

function mergeHandlers(target: HandlerTable, ...layers: (MockHandlers | void | undefined)[]): HandlerTable {
  for (const layer of layers) {
    for (const [domain, members] of Object.entries((layer ?? {}) as HandlerTable)) target[domain] = { ...target[domain], ...members };
  }
  return target;
}

/**
 * 浏览器 / 测试用的完整 DesktopBridge。和 preload 一样经 `buildBridge` 按契约生成，
 * 只是底层传输换成内存实现：invoke 走 handler 表，event 走本地事件总线。
 */
export function createMockBridge(options: CreateMockBridgeOptions = {}): MockBridgeHandle {
  const db = createMockDb();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const channelOf = (event: MockEventName) => desktopBridgeContract.events[event].channel;

  let bridge: DesktopBridge | null = null;
  const clock: MockClock = {
    db,
    get bridge() {
      if (!bridge) throw new Error("Mock bridge is not built yet");
      return bridge;
    },
    emit: (event, payload) => {
      for (const listener of [...(listeners.get(channelOf(event)) ?? [])]) listener(payload);
    },
    schedule: (callback, delayMs) => {
      const timer = setTimeout(() => { timers.delete(timer); callback(); }, delayMs);
      timers.add(timer);
      return () => { clearTimeout(timer); timers.delete(timer); };
    },
  };

  const scenario = MOCK_SCENARIOS[options.scenario ?? "empty"];
  const handlers = mergeHandlers({}, defaultHandlers(clock), scenario(clock), options.handlers);
  const handlerFor = (channel: string) => {
    const route = routes.get(channel);
    return { route, handler: route ? handlers[route.domain]?.[route.member] as ((...args: unknown[]) => unknown) | undefined : undefined };
  };

  const transport: BridgeTransport = {
    invoke: async (channel, input) => {
      const { route, handler } = handlerFor(channel);
      if (!handler) throw new Error(`Mock bridge does not implement ${route ? `${route.domain}.${route.member}` : channel}`);
      return handler(input);
    },
    send: (channel, input) => {
      handlerFor(channel).handler?.(input);
    },
    on: (channel, listener) => {
      const { handler } = handlerFor(channel);
      if (handler) return handler(listener) as () => void;
      const set = listeners.get(channel) ?? new Set();
      set.add(listener);
      listeners.set(channel, set);
      return () => { set.delete(listener); };
    },
  };

  const locals = Object.fromEntries(
    Object.entries(contractDomains).flatMap(([domain, members]) =>
      Object.entries(members)
        .filter(([, spec]) => spec.kind === "local")
        .map(([member]) => [`${domain}.${member}`, (...args: never[]) => handlers[domain]?.[member]?.(...args)]),
    ),
  );
  const built = buildBridge(desktopBridgeContract, transport, locals);
  bridge = built;

  return {
    bridge: built,
    db,
    emit: clock.emit,
    override: (layer) => { mergeHandlers(handlers, layer); },
    dispose: () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      listeners.clear();
    },
  };
}
