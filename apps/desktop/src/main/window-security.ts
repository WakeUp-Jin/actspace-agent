import type { BrowserWindowConstructorOptions } from "electron";
import { pathToFileURL } from "node:url";
import { openExternalSafely } from "./platform-actions";

type OpenExternal = (url: string) => Promise<unknown>;

type GuardedContents = {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
  on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): unknown;
};

type GuardedWindow = { readonly webContents: GuardedContents };

type WebviewSource = {
  on(event: "web-contents-created", listener: (event: unknown, contents: {
    on(event: "will-attach-webview", listener: (event: { preventDefault(): void }) => void): unknown;
  }) => void): unknown;
};

export function createMainWindowOptions(input: { preload: string; title: string }): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 960,
    minWidth: 480,
    minHeight: 760,
    title: input.title,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: input.preload,
      contextIsolation: true,
      nodeIntegration: false,
      // Electron 39 默认已开启；显式写出来，防止以后被误关。preload 只能 require("electron")。
      sandbox: true,
      webviewTag: false,
    },
  };
}

/**
 * 应用自己的页面：dev 时是 dev server 的同源 URL，生产时是 dist 下的 index.html（忽略 query 和 hash）。
 */
export function createAppUrlMatcher(input: { devServerUrl?: string; indexHtmlPath: string }): (url: string) => boolean {
  const devOrigin = input.devServerUrl ? safeUrl(input.devServerUrl)?.origin : undefined;
  const indexHref = pathToFileURL(input.indexHtmlPath).href;
  return (url) => {
    const parsed = safeUrl(url);
    if (!parsed) return false;
    if (devOrigin) return parsed.origin === devOrigin;
    if (parsed.protocol !== "file:") return false;
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}` === indexHref;
  };
}

/**
 * 主窗口不跳出应用：新窗口一律拒绝，安全的外链交给系统浏览器；
 * 顶层导航到非应用 URL 时取消，同样交给系统浏览器（不安全的 URL 直接丢弃）。
 */
export function attachNavigationGuards(
  win: GuardedWindow,
  isAppUrl: (url: string) => boolean,
  openExternal: OpenExternal = openExternalSafely,
): void {
  // 系统打不开（例如没有关联程序）时只是没反应，不让 rejection 冒到全局。
  const openQuietly = (url: string) => void Promise.resolve().then(() => openExternal(url)).catch(() => undefined);
  win.webContents.setWindowOpenHandler(({ url }) => {
    openQuietly(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openQuietly(url);
  });
}

/** 任何 webContents 都不允许挂 `<webview>`。 */
export function blockWebviewAttachment(source: WebviewSource): void {
  source.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
