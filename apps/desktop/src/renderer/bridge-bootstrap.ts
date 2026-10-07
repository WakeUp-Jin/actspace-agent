import { hasPreloadBridge } from "./api/bridge";

export type BridgeSource = "electron" | "mock" | "missing";

/**
 * 启动前确认 bridge：Electron 由 preload 暴露；浏览器开发模式注入 mock（动态 import，生产构建不含 mock）；
 * 其余情况返回 `missing`，由调用方显示致命错误页，不渲染 App。
 */
export async function ensureBridge(): Promise<BridgeSource> {
  if (hasPreloadBridge()) return "electron";
  if (import.meta.env.DEV) {
    const { installMockBridge } = await import("./mock/install-mock-bridge");
    installMockBridge();
    return "mock";
  }
  return "missing";
}

export function renderBridgeMissing(root: HTMLElement): void {
  const main = document.createElement("main");
  main.setAttribute("role", "alert");
  main.className = "flex h-screen flex-col items-center justify-center gap-2 bg-app-bg px-6 text-center";
  const title = document.createElement("h1");
  title.className = "m-0 text-act-md font-semibold text-text-main";
  title.textContent = "无法连接桌面服务";
  const detail = document.createElement("p");
  detail.className = "m-0 text-act-sm text-text-muted";
  detail.textContent = "Desktop bridge missing：页面不是在 ActSpace 桌面端中打开的。请从桌面应用启动。";
  main.append(title, detail);
  root.replaceChildren(main);
}
