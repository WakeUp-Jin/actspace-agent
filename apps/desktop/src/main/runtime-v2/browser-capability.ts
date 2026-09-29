import { createNodeBrowserCapability, type BrowserCapability } from "@actspace/tools-browser-tools";
import type { DesktopRuntimeV2BrowserPort } from "./host-ports";

export async function createDesktopBrowserCapability(
  service: DesktopRuntimeV2BrowserPort,
): Promise<BrowserCapability> {
  const status = await service.getStatus();
  const socketPath = service.socketPath;
  const capability = createNodeBrowserCapability({
    ready: status.bridgeReady === true,
    socketPath,
    isAllowed: () => service.isBrowserAllowed?.() !== false && service.socketPath === socketPath,
  });
  if (capability.endTurn) service.setTurnTerminator?.(capability.endTurn);
  if (capability.dispose) service.setBrowserDisposer?.(capability.dispose);
  return capability;
}
