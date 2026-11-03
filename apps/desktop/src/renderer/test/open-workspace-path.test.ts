import { describe, expect, it, vi } from "vitest";
import type { WorkspaceOpenFileResult, WorkspaceReadFileResult, WorkspaceStatFileResult } from "@actspace/shared";
import { classifyWorkspaceFile, openWorkspacePath } from "../components/files/open-workspace-path";
import { setupBridge } from "./helpers/bridge";

function install(overrides: { read?: () => Promise<WorkspaceReadFileResult>; open?: () => Promise<WorkspaceOpenFileResult>; stat?: (input: { relativePath: string }) => Promise<WorkspaceStatFileResult> } = {}) {
  const read = vi.fn(overrides.read ?? (async (): Promise<WorkspaceReadFileResult> => ({ relativePath: "x", renderKind: "markdown", size: 1, mtimeMs: 1, content: "# x" })));
  const open = vi.fn(overrides.open ?? (async (): Promise<WorkspaceOpenFileResult> => ({ ok: true })));
  const stat = vi.fn(overrides.stat ?? (async ({ relativePath }: { relativePath: string }): Promise<WorkspaceStatFileResult> => ({ relativePath, size: 1, mtimeMs: 1 })));
  setupBridge({ "workspaces.readFile": read, "workspaces.openFile": open, "workspaces.statFile": stat });
  return { read, open, stat };
}

describe("classifyWorkspaceFile", () => {
  it.each([
    ["docs/a.md", "markdown"], ["A.MARKDOWN", "markdown"],
    ["a.png", "image"], ["a.JPG", "image"], ["a.jpeg", "image"], ["a.gif", "image"], ["a.webp", "image"], ["a.svg", "image"],
    ["report.html", "external"], ["report.HTM", "external"], ["main.ts", "external"], ["a.pdf", "external"], ["data.csv", "external"], ["Makefile", "external"],
  ] as const)("%s -> %s", (path, kind) => {
    expect(classifyWorkspaceFile(path)).toBe(kind);
  });
});

describe("openWorkspacePath", () => {
  it("opens the docs panel on Markdown and asks it to select the file, without reading the body", async () => {
    const { read, open, stat } = install();
    const openTab = vi.fn();
    expect(await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "docs/a.md", openTab })).toEqual({ ok: true });
    expect(stat).toHaveBeenCalledWith({ workspaceRoot: "/ws", relativePath: "docs/a.md" });
    expect(read).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(openTab).toHaveBeenCalledWith({ id: "docs", kind: "docs", title: "文档", select: "docs/a.md" });
  });

  it("passes the line to the docs panel for Markdown only; other files ignore it", async () => {
    const { open } = install();
    const openTab = vi.fn();
    await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "docs/a.md", line: 12, openTab });
    expect(openTab).toHaveBeenCalledWith({ id: "docs", kind: "docs", title: "文档", select: "docs/a.md", line: 12 });

    openTab.mockClear();
    await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "main.ts", line: 12, openTab });
    expect(open).toHaveBeenCalledWith({ workspaceRoot: "/ws", relativePath: "main.ts", action: "open" });
    expect(openTab).not.toHaveBeenCalled();
  });

  it("does not add a line key when none is given", async () => {
    install();
    const openTab = vi.fn();
    await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "docs/a.md", openTab });
    expect(Object.keys(openTab.mock.calls[0][0])).not.toContain("line");
  });

  it("reads an image and opens an image tab", async () => {
    install({ read: async () => ({ relativePath: "a.png", renderKind: "image", size: 3, mtimeMs: 1, dataUrl: "data:image/png;base64,AA==" }) });
    const openTab = vi.fn();
    expect(await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "a.png", openTab })).toEqual({ ok: true });
    expect(openTab).toHaveBeenCalledWith(expect.objectContaining({ kind: "image", src: "data:image/png;base64,AA==" }));
  });

  it.each(["report.html", "page.htm", "main.ts", "a.pdf"])("hands %s to the system without reading or opening a tab", async (relativePath) => {
    const { read, open } = install();
    const openTab = vi.fn();
    expect(await openWorkspacePath({ workspaceRoot: "/ws", relativePath, openTab })).toEqual({ ok: true });
    expect(open).toHaveBeenCalledWith({ workspaceRoot: "/ws", relativePath, action: "open" });
    expect(read).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
  });

  it("reports no_app when the system has no application for the file", async () => {
    install({ open: async () => ({ ok: false, error: "no_application", message: "Failed to open path" }) });
    expect(await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "main.ts", openTab: vi.fn() })).toEqual({ ok: false, reason: "no_app", relativePath: "main.ts" });
  });

  it("reports other open failures and thrown errors as a message", async () => {
    install({ open: async () => ({ ok: false, error: "open_failed", message: "boom" }) });
    expect(await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "a.html", openTab: vi.fn() })).toMatchObject({ ok: false, reason: "error" });
    install({ open: async () => { throw new Error("ipc"); } });
    expect(await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "a.html", openTab: vi.fn() })).toMatchObject({ ok: false, reason: "error" });
  });

  it("returns the read error text for a missing Markdown file instead of opening the docs panel", async () => {
    install({ stat: async () => ({ relativePath: "gone.md", size: 0, mtimeMs: 0, error: "not_found" }) });
    const openTab = vi.fn();
    expect(await openWorkspacePath({ workspaceRoot: "/ws", relativePath: "gone.md", openTab })).toEqual({ ok: false, reason: "error", message: "文件不存在或已被移动。" });
    expect(openTab).not.toHaveBeenCalled();
  });
});
