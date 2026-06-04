import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import {
  createHelperScript,
  deriveMacAppPath,
  isActspaceAppBundle,
  isDevelopmentElectronRuntime,
  LocalUpdateService,
} from "../local-update-service";

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

async function makeInstalledApp(bundleName = "Actspace.app", executableName = "Actspace"): Promise<string> {
  const root = await makeTempRoot("actspace-installed-");
  const appPath = join(root, bundleName);
  await mkdir(join(appPath, "Contents", "MacOS"), { recursive: true });
  return join(appPath, "Contents", "MacOS", executableName);
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
    onReadyToReplace: options.onReadyToReplace,
    readinessPollMs: options.readinessPollMs,
  });
}

describe("LocalUpdateService", () => {
  it("derives the macOS .app root from the executable path", () => {
    expect(deriveMacAppPath("/Applications/Actspace.app/Contents/MacOS/Actspace")).toBe(
      "/Applications/Actspace.app",
    );
    expect(deriveMacAppPath("/tmp/dev/electron")).toBeNull();
  });

  it("recognizes actspace app bundles case-insensitively and rejects dependency electron runtimes", () => {
    expect(isActspaceAppBundle("/Applications/Actspace.app")).toBe(true);
    expect(isActspaceAppBundle("/Applications/actspace.app")).toBe(true);
    expect(isActspaceAppBundle("/Applications/Electron.app")).toBe(false);

    expect(isDevelopmentElectronRuntime("/repo/node_modules/electron/dist/Electron.app")).toBe(true);
    expect(isDevelopmentElectronRuntime("/Applications/Actspace.app")).toBe(false);
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
    expect(result.state.progress.phase).toBe("starting");
    expect(spawnHelper).toHaveBeenCalledTimes(1);

    const scriptPath = spawnHelper.mock.calls[0]?.[0] ?? "";
    const script = await readFile(scriptPath, "utf8");
    expect(script).toContain("export PATH=\"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH\"");
    expect(script).toContain("STATUS_PATH=");
    expect(script).toContain("write_status \"building\"");
    expect(script).toContain("command -v pnpm");
    expect(script).toContain("export ACTSPACE_MAC_ADHOC_SIGN=true");
    expect(script).toContain("\"$PNPM_BIN\" package:desktop:dmg");
    expect(script).toContain("validate_new_app()");
    expect(script).toContain("codesign --verify --no-strict --verbose=2 \"$app\"");
    expect(script).toContain("write_failed \"构建出的 Actspace.app 未通过启动前验证，已保留当前版本。\"");
    expect(script).toContain("write_status \"ready_to_replace\"");
    expect(script).toContain('NEW_APP="$SOURCE_ROOT/dist/desktop/Actspace.app"');
    expect(script).toContain('NEW_APP="$SOURCE_ROOT/dist/desktop/actspace.app"');
    expect(script).toContain('TARGET_APP="$(dirname "$APP_PATH")/$(basename "$NEW_APP")"');
    expect(script).toContain('ditto "$NEW_APP" "$TARGET_APP"');
    expect(script).toContain('if ! open "$TARGET_APP"; then');
    expect(script).toContain("write_failed \"更新后的 Actspace.app 启动失败，已恢复旧版本。\"");
  });

  it("allows a copied Actspace app even when Electron reports isPackaged=false", async () => {
    const dataRoot = await makeTempRoot("actspace-update-data-");
    const sourceRoot = await makeSourceRoot();
    const appExe = await makeInstalledApp("actspace.app", "Electron");
    const spawnHelper = vi.fn((scriptPath: string) => ({ unref: vi.fn(), scriptPath }) as unknown as ChildProcess);
    const svc = makeService({ dataRoot, appPath: appExe, isPackaged: false, spawnHelper });
    await svc.load();

    await svc.setSourceRoot(sourceRoot);
    const before = await svc.getState();
    expect(before.canUpdate).toBe(true);
    expect(before.appIsPackaged).toBe(false);
    expect(before.appExecutablePath).toBe(appExe);

    const result = await svc.start();

    expect(result.ok).toBe(true);
    expect(spawnHelper).toHaveBeenCalledTimes(1);
  });

  it("requests app quit only after helper reports it is ready to replace", async () => {
    const dataRoot = await makeTempRoot("actspace-update-data-");
    const sourceRoot = await makeSourceRoot();
    const appExe = await makeInstalledApp();
    const onReadyToReplace = vi.fn();
    const spawnHelper = vi.fn((_scriptPath: string) => {
      void writeFile(
        join(dataRoot, "tmp", "local-update", "status.json"),
        JSON.stringify({
          phase: "ready_to_replace",
          message: "构建完成，准备退出并替换应用。",
          startedAt: "2026-05-31T16:00:00.000Z",
          updatedAt: "2026-05-31T16:00:01.000Z",
        }),
        "utf8",
      );
      return { unref: vi.fn() } as unknown as ChildProcess;
    });
    const svc = makeService({
      dataRoot,
      appPath: appExe,
      spawnHelper,
      onReadyToReplace,
      readinessPollMs: 5,
    });
    await svc.load();
    await svc.setSourceRoot(sourceRoot);

    const result = await svc.start();

    expect(result.ok).toBe(true);
    await vi.waitFor(() => {
      expect(onReadyToReplace).toHaveBeenCalledTimes(1);
    });
  });

  it("treats failed helper status as retryable instead of stuck running", async () => {
    const dataRoot = await makeTempRoot("actspace-update-data-");
    const sourceRoot = await makeSourceRoot();
    const appExe = await makeInstalledApp();
    const svc = makeService({ dataRoot, appPath: appExe });
    await svc.load();
    await svc.setSourceRoot(sourceRoot);
    await mkdir(join(dataRoot, "tmp", "local-update"), { recursive: true });
    await writeFile(
      join(dataRoot, "tmp", "local-update", "status.json"),
      JSON.stringify({
        phase: "failed",
        message: "未找到 pnpm，请确认 Homebrew 路径已加入环境。",
        startedAt: "2026-05-31T16:00:00.000Z",
        updatedAt: "2026-05-31T16:00:01.000Z",
        finishedAt: "2026-05-31T16:00:01.000Z",
      }),
      "utf8",
    );

    const state = await svc.getState();

    expect(state.running).toBe(false);
    expect(state.canUpdate).toBe(true);
    expect(state.progress.phase).toBe("failed");
    expect(state.progress.message).toContain("未找到 pnpm");
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

  it("rejects the Electron runtime inside node_modules", async () => {
    const svc = makeService({
      dataRoot: await makeTempRoot("actspace-update-data-"),
      appPath: "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
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
      appPath: "/Applications/Actspace.app",
      pid: 42,
      logPath: "/tmp/update log.txt",
      statusPath: "/tmp/status with 'quote'.json",
    });

    expect(script).toContain("SOURCE_ROOT='/tmp/source with '\\''quote'\\'''");
    expect(script).toContain("STATUS_PATH='/tmp/status with '\\''quote'\\''.json'");
    expect(script).toContain("APP_PID=42");
    expect(script).toContain("CURRENT_BACKUP=\"$APP_PATH.previous-local-update\"");
    expect(script).toContain("TARGET_BACKUP=\"$TARGET_APP.previous-local-update\"");
  });

  it("restores the previous app when the copied update fails to open", () => {
    const script = createHelperScript({
      sourceRoot: "/tmp/source",
      appPath: "/Applications/Actspace.app",
      pid: 42,
      logPath: "/tmp/update.log",
      statusPath: "/tmp/status.json",
    });

    expect(script).toContain("restore_previous_app()");
    expect(script).toContain("rm -rf \"$TARGET_APP\"");
    expect(script).toContain("mv \"$CURRENT_BACKUP\" \"$APP_PATH\"");
    expect(script).toContain("if ! open \"$TARGET_APP\"; then");
    expect(script).toContain("restore_previous_app");
    expect(script).toContain("write_failed \"更新后的 Actspace.app 启动失败，已恢复旧版本。\"");
  });
});
