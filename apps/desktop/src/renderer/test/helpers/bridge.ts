import { desktopBridgeContract, type DesktopBridge } from "@actspace/shared/desktop-bridge";
import { installBridge } from "../../api/bridge";
import { createMockBridge, type MockBridgeHandle, type MockHandlers, type MockScenario } from "../../mock/create-mock-bridge";

type Domain = keyof DesktopBridge;

/** 契约路径，例如 `"sessions.list"`、`"events.agentStream"`。 */
export type BridgePath = { [D in Domain]: `${D}.${keyof DesktopBridge[D] & string}` }[Domain];

type MemberAt<P extends BridgePath> = P extends `${infer D extends Domain}.${infer M}`
  ? M extends keyof DesktopBridge[D] ? DesktopBridge[D][M] : never
  : never;

type ParamsOf<F> = F extends (...args: infer A) => unknown ? A : never;

/**
 * 测试覆盖表，键是契约路径。用扁平键而不是嵌套域对象，是为了让测试照常用对象展开组合 stub
 * （`{ ...baseStubs, "sessions.get": … }`），不会因为浅合并丢掉同域的其他成员。
 * 参数按契约签名推断；返回值放宽，测试 stub 通常只返回用到的字段。
 */
export type BridgeOverrides = { [P in BridgePath]?: (...args: ParamsOf<MemberAt<P>>) => unknown };

let current: MockBridgeHandle | null = null;

function toHandlers(overrides: BridgeOverrides): MockHandlers {
  const contract = desktopBridgeContract as unknown as Record<string, Record<string, unknown>>;
  const handlers: Record<string, Record<string, unknown>> = {};
  for (const [path, implementation] of Object.entries(overrides)) {
    const [domain, member, ...rest] = path.split(".");
    if (!domain || !member || rest.length > 0 || !contract[domain]?.[member]) throw new Error(`Unknown bridge path in test overrides: ${path}`);
    if (typeof implementation !== "function") throw new Error(`Bridge override ${path} must be a function`);
    (handlers[domain] ??= {})[member] = implementation;
  }
  return handlers as MockHandlers;
}

/**
 * 安装一个以 mock bridge 为底、按 `overrides` 覆盖的 `window.actspace`，返回句柄（`emit` 推事件、`db` 读写内存表）。
 * `setup.ts` 在每个用例前装一个默认实例、用例后清理；用例里再调用会替换掉它。
 */
export function setupBridge(overrides: BridgeOverrides = {}, scenario?: MockScenario): MockBridgeHandle {
  resetBridge();
  const handle = createMockBridge({ scenario, handlers: toHandlers(overrides) });
  installBridge(handle.bridge);
  current = handle;
  return handle;
}

/** 在当前 bridge 上追加覆盖，用于渲染之后再换实现的用例。 */
export function overrideBridge(overrides: BridgeOverrides): void {
  if (!current) throw new Error("overrideBridge() called before setupBridge()");
  current.override(toHandlers(overrides));
}

/** 卸载当前 bridge：清理 mock 的计时器和订阅，并从 window 上移除。 */
export function resetBridge(): void {
  current?.dispose();
  current = null;
  delete (window as Partial<Window>).actspace;
}
