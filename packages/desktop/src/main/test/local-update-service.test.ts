import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { createHelperScript, deriveMacAppPath, LocalUpdateService } from "../local-update-service";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempRoot(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

async function makeSourceRoot(): Promise<string> {
  const root = await makeTempRoot("actspace-update-source-");
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "actspace",
      scripts: { "package:desktop:dmg": "./scripts/release-package.sh" },
    }),
    "utf8",
  );
  await writeFile(join(root, "scripts", "release-package.sh"), "#!/usr/bin/env bash\n", "utf8");
  return root;
}

async function makeInstalledApp(): Promise<string> {
  const root = await makeTempRoot("actspace-installed-");
  const appPath = join(root, "actspace.app");
  await mkdir(join(appPath, "Contents", "MacOS"), { recursive: true });
  return join(appPath, "Contents", "MacOS", "actspace");
}

function makeService(options: Partial<ConstructorParameters<typeof LocalUpdateService>[0]> = {}) {
  return new LocalUpdateService({
    dataRoot: options.dataRoot ?? "",
    appPath: options.appPath ?? "",
    isPackaged: options.isPackaged ?? true,
    platform: options.platform ?? "darwin",
    pid: options.pid ?? 1234,
    spawnHelper: options.spawnHelper,
    now: options.now ?? (() => new Date("2026-05-31T16:00:00.000Z")),
  });
}

describe("LocalUpdateService", () => {
  it("derives the macOS .app root from the executable path", () => {
    expect(deriveMacAppPath("/Applications/actspace.app/Contents/MacOS/actspace")).toBe(
      "/Applications/actspace.app",
    );
    expect(deriveMacAppPath("/tmp/dev/electron")).toBeNull();
  });

  it("reports missing source before update can start", async () => {
    const svc = makeService({ dataRoot: await makeTempRoot("actspace-update-data-"), appPath: await makeInstalledApp() });
    await svc.load();

    const state = await svc.getState();

    expect(state.sourceValid).toBe(false);
    expect(state.sourceError).toBe("missing_source");
    expect(state.canUpdate).toBe(false);
  });

  it("validates source root and starts a detached helper", async () => {
    const dataRoot = await makeTempRoot("actspace-update-data-");
    const sourceRoot = await makeSourceRoot();
    const appExe = await makeInstalledApp();
    const spawnHelper = vi.fn((scriptPath: string) => ({ unref: vi.fn(), scriptPath }) as unknown as ChildProcess);
    const svc = makeService({ dataRoot, appPath: appExe, spawnHelper });
    await svc.load();

    await svc.setSourceRoot(sourceRoot);
    const before = await svc.getState();
    expect(before.sourceValid).toBe(true);
    expect(before.canUpdate).toBe(true);

    const result = await svc.start();

    expect(result.ok).toBe(true);
    expect(result.state.running).toBe(true);
    expect(result.state.lastStartedAt).toBe("2026-05-31T16:00:00.000Z");
    expect(spawnHelper).toHaveBeenCalledTimes(1);

    const scriptPath = spawnHelper.mock.calls[0]?.[0] ?? "";
    const script = await readFile(scriptPath, "utf8");
    expect(script).toContain("pnpm package:desktop:dmg");
    expect(script).toContain('NEW_APP="$SOURCE_ROOT/dist/desktop/actspace.app"');
    expect(script).toContain('ditto "$NEW_APP" "$APP_PATH"');
  });

  it("rejects development mode because there is no installed app to replace", async () => {
    const svc = makeService({
      dataRoot: await makeTempRoot("actspace-update-data-"),
      appPath: "/tmp/electron",
      isPackaged: false,
    });
    await svc.setSourceRoot(await makeSourceRoot());

    const result = await svc.start();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("not_packaged");
  });

  it("quotes shell paths in the generated helper script", () => {
    const script = createHelperScript({
      sourceRoot: "/tmp/source with 'quote'",
      appPath: "/Applications/actspace.app",
      pid: 42,
      logPath: "/tmp/update log.txt",
    });

    expect(script).toContain("SOURCE_ROOT='/tmp/source with '\\''quote'\\'''");
    expect(script).toContain("APP_PID=42");
    expect(script).toContain("BACKUP_APP=\"$APP_PATH.previous-local-update\"");
  });
});
