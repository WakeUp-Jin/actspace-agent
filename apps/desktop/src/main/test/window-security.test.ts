import { EventEmitter } from "node:events";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));

import { attachNavigationGuards, blockWebviewAttachment, createAppUrlMatcher, createMainWindowOptions } from "../window-security";

function fakeWindow() {
  const contents = Object.assign(new EventEmitter(), {
    openHandler: undefined as undefined | ((details: { url: string }) => { action: "deny" }),
    setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }) {
      this.openHandler = handler;
    },
  });
  return { webContents: contents };
}

function navigate(win: ReturnType<typeof fakeWindow>, url: string) {
  const event = { preventDefault: vi.fn() };
  win.webContents.emit("will-navigate", event, url);
  return event;
}

describe("main window options", () => {
  it("keeps the renderer sandboxed and isolated", () => {
    const options = createMainWindowOptions({ preload: "/app/preload.js", title: "ActSpace" });
    expect(options.webPreferences).toMatchObject({
      preload: "/app/preload.js",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    });
    expect(options.title).toBe("ActSpace");
  });
});

describe("app URL matcher", () => {
  const indexHtmlPath = join("/Applications/ActSpace.app/Contents/Resources/app/dist", "index.html");

  it("accepts the dist index file with any query or hash", () => {
    const isAppUrl = createAppUrlMatcher({ indexHtmlPath });
    const href = pathToFileURL(indexHtmlPath).href;
    expect(isAppUrl(href)).toBe(true);
    expect(isAppUrl(`${href}?view=settings#models`)).toBe(true);
    expect(isAppUrl(pathToFileURL("/etc/passwd").href)).toBe(false);
    expect(isAppUrl(pathToFileURL(join(indexHtmlPath, "..", "other.html")).href)).toBe(false);
    expect(isAppUrl("https://example.com/")).toBe(false);
    expect(isAppUrl("not a url")).toBe(false);
  });

  it("accepts only the dev server origin in development", () => {
    const isAppUrl = createAppUrlMatcher({ devServerUrl: "http://127.0.0.1:5173", indexHtmlPath });
    expect(isAppUrl("http://127.0.0.1:5173/")).toBe(true);
    expect(isAppUrl("http://127.0.0.1:5173/src/main.tsx?x=1")).toBe(true);
    expect(isAppUrl("http://127.0.0.1:5174/")).toBe(false);
    expect(isAppUrl("http://localhost:5173/")).toBe(false);
    expect(isAppUrl(pathToFileURL(indexHtmlPath).href)).toBe(false);
  });
});

describe("navigation guards", () => {
  const isAppUrl = (url: string) => url.startsWith("file:///app/");

  it("denies every new window and hands the URL to the safe opener", async () => {
    const win = fakeWindow();
    const openExternal = vi.fn(async () => true);
    attachNavigationGuards(win, isAppUrl, openExternal);

    expect(win.webContents.openHandler!({ url: "https://example.com/docs" })).toEqual({ action: "deny" });
    expect(win.webContents.openHandler!({ url: "file:///app/index.html" })).toEqual({ action: "deny" });
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledTimes(2));
    expect(openExternal).toHaveBeenCalledWith("https://example.com/docs");
  });

  it("cancels top-level navigation away from the app", async () => {
    const win = fakeWindow();
    const openExternal = vi.fn(async () => true);
    attachNavigationGuards(win, isAppUrl, openExternal);

    expect(navigate(win, "https://example.com/").preventDefault).toHaveBeenCalledTimes(1);
    expect(navigate(win, "file:///etc/passwd").preventDefault).toHaveBeenCalledTimes(1);
    expect(navigate(win, "file:///app/index.html#settings").preventDefault).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledTimes(2));
    expect(openExternal).not.toHaveBeenCalledWith("file:///app/index.html#settings");
  });

  it("swallows opener failures", async () => {
    const win = fakeWindow();
    const openExternal = vi.fn(async () => { throw new Error("no handler"); });
    const onRejection = vi.fn();
    process.on("unhandledRejection", onRejection);
    try {
      attachNavigationGuards(win, isAppUrl, openExternal);
      win.webContents.openHandler!({ url: "https://example.com/" });
      await vi.waitFor(() => expect(openExternal).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onRejection).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("uses openExternalSafely by default, so unsafe URLs are dropped", async () => {
    const { shell } = await import("electron");
    const win = fakeWindow();
    attachNavigationGuards(win, isAppUrl);
    win.webContents.openHandler!({ url: "javascript:alert(1)" });
    navigate(win, "file:///etc/passwd");
    win.webContents.openHandler!({ url: "https://example.com/ok" });
    await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalledWith("https://example.com/ok"));
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
  });
});

describe("webview blocking", () => {
  it("prevents <webview> attachment on every new webContents", () => {
    const app = new EventEmitter();
    blockWebviewAttachment(app as never);
    const contents = new EventEmitter();
    app.emit("web-contents-created", {}, contents);
    const event = { preventDefault: vi.fn() };
    contents.emit("will-attach-webview", event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});
