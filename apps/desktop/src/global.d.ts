import type { DesktopBridge } from "@actspace/shared/desktop-bridge";

declare global {
  interface Window {
    /** preload 按 `desktopBridgeContract` 生成。renderer 只经 `renderer/api/<域>` 访问（`check:renderer-bridge`）。 */
    actspace: DesktopBridge;
  }
}
