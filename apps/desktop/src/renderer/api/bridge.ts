import { desktopBridgeContract, type DesktopBridge } from "@actspace/shared/desktop-bridge";

/** renderer 访问 bridge 的唯一入口（由 `check:renderer-bridge` 约束）；组件只 import `api/<域>`。 */
export function getBridge(): DesktopBridge {
  return window.actspace;
}

/** preload 是否已经暴露 bridge（Electron 下为真）；启动时决定是否注入 mock。 */
export function hasPreloadBridge(): boolean {
  return Boolean(window.actspace);
}

/** 浏览器开发模式和测试注入 bridge 的入口；Electron 下 preload 已经暴露，不调用这里。 */
export function installBridge(bridge: DesktopBridge): void {
  window.actspace = bridge;
}

/**
 * 某个域的转发对象：成员按契约生成，每次调用时才取当前 bridge。
 * 不在模块加载时取 `window.actspace[domain]`，因为测试会在用例之间替换 bridge。
 */
export function domainApi<D extends keyof DesktopBridge>(domain: D): DesktopBridge[D] {
  const api: Record<string, (...args: unknown[]) => unknown> = {};
  for (const member of Object.keys(desktopBridgeContract[domain])) {
    api[member] = (...args) => (getBridge()[domain] as unknown as Record<string, (...args: unknown[]) => unknown>)[member]!(...args);
  }
  return Object.freeze(api) as unknown as DesktopBridge[D];
}
