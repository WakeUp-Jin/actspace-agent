import { installBridge } from "../api/bridge";
import { createMockBridge, type MockBridgeHandle } from "./create-mock-bridge";
import { isMockScenario } from "./scenarios";

/** 浏览器开发模式入口：按 `?mock=` 选场景（默认 `empty`），注入 mock bridge。 */
export function installMockBridge(search: string = window.location.search): MockBridgeHandle {
  const requested = new URLSearchParams(search).get("mock");
  if (requested && !isMockScenario(requested)) console.warn(`Unknown mock scenario "${requested}", using "empty".`);
  const handle = createMockBridge({ scenario: isMockScenario(requested) ? requested : "empty" });
  installBridge(handle.bridge);
  return handle;
}
