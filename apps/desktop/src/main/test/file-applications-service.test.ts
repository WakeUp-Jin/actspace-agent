import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDataRoots } from "../app-paths";

vi.mock("electron", () => ({
  clipboard: { writeImage: vi.fn(), writeText: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromDataURL: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
}));

import { dedupeMacApplications, listWorkspaceFileApplications, openWorkspaceFile, parseMacApplications } from "../file-applications-service";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoots(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-file-apps-"));
  created.push(dataRoot);
  const workspaceRoot = join(dataRoot, "workspace");
  await mkdir(join(workspaceRoot, "out"), { recursive: true });
  await writeFile(join(workspaceRoot, "out", "report.docx"), "doc");
  return { dataRoot, sessionRoot: join(dataRoot, "sessions"), logRoot: join(dataRoot, "logs"), tmpRoot: join(dataRoot, "tmp"), defaultWorkspaceRoot: workspaceRoot, workspaceRoot };
}

const handlers = [
  { id: "/Applications/Word.app", name: "Microsoft Word", default: false, icon: "data:image/png;base64,AAA", bundle: "com.microsoft.Word", version: "16.1" },
  { id: "/Users/me/Library/Word.app", name: "Microsoft Word", default: false, icon: null, bundle: "com.microsoft.Word", version: "16.9" },
  { id: "/System/Applications/Pages.app", name: "Pages", default: true, icon: null, bundle: "com.apple.Pages", version: "14.0" },
  { id: "/Applications/Pages.app", name: "Pages", default: false, icon: null, bundle: "com.apple.Pages", version: "15.0" },
  { id: "/Applications/Tool.app", name: "Tool", default: false, icon: null, bundle: null, version: null },
];

describe("file applications service", () => {
  it("collapses duplicate app copies to the default, else the highest version, at the first position", () => {
    expect(dedupeMacApplications(parseMacApplications(handlers))).toEqual([
      { id: "/Users/me/Library/Word.app", name: "Microsoft Word", default: false },
      { id: "/System/Applications/Pages.app", name: "Pages", default: true },
      { id: "/Applications/Tool.app", name: "Tool", default: false },
    ]);
    expect(() => parseMacApplications([{ id: 1 }])).toThrow();
  });

  it("lists applications for workspace files and rejects paths outside the workspace", async () => {
    const roots = await makeRoots();
    const run = vi.fn(async () => JSON.stringify(handlers.slice(0, 1)));
    const result = await listWorkspaceFileApplications({ workspaceRoot: roots.workspaceRoot, relativePath: "out/report.docx" }, roots, { platform: "darwin", run });
    expect(result).toEqual({ applications: [{ id: "/Applications/Word.app", name: "Microsoft Word", default: false, iconDataUrl: "data:image/png;base64,AAA" }] });
    const [, args] = run.mock.calls[0] as unknown as [string, string[]];
    expect(args.slice(-2)).toEqual([await realpath(join(roots.workspaceRoot, "out", "report.docx")), "icons"]);

    expect(await listWorkspaceFileApplications({ workspaceRoot: roots.workspaceRoot, relativePath: "../outside.docx" }, roots, { platform: "darwin", run })).toEqual({ applications: [], error: "invalid_target" });
    expect(await listWorkspaceFileApplications({ workspaceRoot: roots.workspaceRoot, relativePath: "out/report.docx" }, roots, { platform: "linux", run })).toEqual({ applications: [] });
  });

  it("opens with a registered application, the default app, or reveals the file", async () => {
    const roots = await makeRoots();
    const file = await realpath(join(roots.workspaceRoot, "out", "report.docx"));
    const run = vi.fn(async (command: string) => command.endsWith("osascript") ? JSON.stringify(handlers) : "");
    const openPath = vi.fn(async () => "");
    const showItemInFolder = vi.fn();
    const deps = { platform: "darwin" as const, run, openPath, showItemInFolder };
    const input = { workspaceRoot: roots.workspaceRoot, relativePath: "out/report.docx" };

    // 去重时被合并掉的副本仍然可以打开。
    expect(await openWorkspaceFile({ ...input, action: "open", applicationId: "/Applications/Word.app" }, roots, deps)).toEqual({ ok: true });
    expect(run).toHaveBeenLastCalledWith("/usr/bin/open", ["-a", "/Applications/Word.app", file]);
    expect(await openWorkspaceFile({ ...input, action: "open", applicationId: "/Applications/Evil.app" }, roots, deps)).toMatchObject({ ok: false, error: "not_registered" });
    expect(await openWorkspaceFile({ ...input, action: "open" }, roots, deps)).toEqual({ ok: true });
    expect(openPath).toHaveBeenCalledWith(file);
    expect(await openWorkspaceFile({ ...input, action: "reveal" }, roots, deps)).toEqual({ ok: true });
    expect(showItemInFolder).toHaveBeenCalledWith(file);
    expect(await openWorkspaceFile({ ...input, relativePath: "missing.docx", action: "reveal" }, roots, deps)).toMatchObject({ ok: false, error: "invalid_target" });
  });
});
