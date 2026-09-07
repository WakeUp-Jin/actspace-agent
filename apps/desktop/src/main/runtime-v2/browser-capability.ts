import { createNodeBrowserCapability, type BrowserCapability } from "@actspace/tools-browser-tools";
import type { DesktopRuntimeV2BrowserPort } from "./host-ports";

export async function createDesktopBrowserCapability(
  service: DesktopRuntimeV2BrowserPort,
): Promise<BrowserCapability> {
  const status = await service.getStatus();
  return createNodeBrowserCapability({
    ready: status.runState === "ready",
    socketPath: service.socketPath,
  });
}
