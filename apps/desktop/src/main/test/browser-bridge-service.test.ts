// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserBridgeService } from "../browser-bridge-service";

describe("BrowserBridgeService", () => {
  const tempDirs: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    vi.unstubAllEnvs();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("binds the verified instance, persists disconnect and ignores another Chrome profile", async () => {
    const root = await mkdtemp("/tmp/actspace-bc-");
    tempDirs.push(root);
    const support = join(root, "support");
    vi.stubEnv("ABB_SUPPORT_DIR", support);
    await mkdir(join(support, "instances"), { recursive: true });
    const instanceId = "00000000-0000-4000-8000-000000000001";
    const socketPath = join(support, "s-0000000000000001.sock");
    const server = createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    servers.push(server);
    await chmod(socketPath, 0o600);
    await writeFile(join(support, "instances", "s-0000000000000001.sock.json"), JSON.stringify({
      hostId: "s-0000000000000001.sock", extensionInstanceId: instanceId, socketPath,
      hostVersion: "0.1.0-dev", extensionVersion: "0.2.2", protocolVersion: "0.2.0",
    }), { mode: 0o600 });
    const source = join(root, "source-abb");
    await writeFile(source, ["#!/bin/sh", "case \"$1\" in",
      "help) echo 'Agent Browser Bridge fixture' ;;",
      "doctor) echo '{\"checks\":[{\"name\":\"local_rpc_socket\",\"status\":\"offline\",\"detail\":\"ambiguous default socket\"}]}' ;;",
      `info) echo '{"ok":true,"result":{"instanceId":"${instanceId}","version":"0.2.2","protocolVersion":"0.2.0","hostId":"s-0000000000000001.sock","hostVersion":"0.1.0-dev"}}' ;;`,
      "tabs) echo '[]' ;;", "capabilities) echo '{}' ;;", "esac", ""].join("\n"));
    await chmod(source, 0o755);
    const service = new BrowserBridgeService({ dataRoot: join(root, "data") });
    await service.installFromFile(source);
    await writeFile(join(service.pluginRoot, "connection.json"), '{"schemaVersion":1,"enabled":true}');
    const connected = await service.getStatus();
    expect(connected).toMatchObject({ runState: "waiting_for_runtime", bridgeReady: true, selectedInstanceId: instanceId });
    expect(connected.doctorChecks.find((check) => check.name === "local_rpc_socket")).toMatchObject({
      status: "ok", detail: `Local bridge socket is accepting requests at ${socketPath}.`,
    });
    expect(service.socketPath).toBe(socketPath);
    expect(service.isBrowserAllowed()).toBe(true);
    service.setRuntimeReady(true);
    expect((await service.getStatus()).runState).toBe("ready");
    const dispose = vi.fn(async () => {});
    service.setBrowserDisposer(dispose);
    await writeFile(join(support, "instances", "s-0000000000000001.sock.json"), JSON.stringify({
      hostId: "s-0000000000000001.sock", extensionInstanceId: instanceId, socketPath,
      hostVersion: "unverified-host", extensionVersion: "0.2.2", protocolVersion: "0.2.0",
    }), { mode: 0o600 });
    expect((await service.getStatus()).bridgeReady).toBe(false);
    expect(service.isBrowserAllowed()).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    await service.disconnect();
    const reopened = new BrowserBridgeService({ dataRoot: join(root, "data") });
    expect(await reopened.getStatus()).toMatchObject({ enabled: false, runState: "disconnected", selectedInstanceId: instanceId });
    expect(reopened.isBrowserAllowed()).toBe(false);
  });

  it("rejects a corrupted bundled binary before replacing installed files", async () => {
    const root = await mkdtemp("/tmp/actspace-package-");
    tempDirs.push(root);
    const bundle = join(root, "bundle");
    await mkdir(join(bundle, "bin"), { recursive: true });
    const host = "#!/bin/sh\necho 'Agent Browser Bridge fixture'\n";
    await writeFile(join(bundle, "bin", "abb"), host);
    await writeFile(join(bundle, "manifest.json"), JSON.stringify({ schemaVersion: 1, platform: process.platform, arch: process.arch,
      hostVersion: "0.1.0-dev", extensionVersion: "0.2.2", protocolVersion: "0.2.0",
      files: { "bin/abb": createHash("sha256").update("different").digest("hex") } }));
    const service = new BrowserBridgeService({ dataRoot: join(root, "data"), bundledRoot: bundle });
    expect(await service.installBundled()).toMatchObject({ ok: false, error: "Chrome 连接组件校验失败：bin/abb" });
    expect((await service.getStatus()).installed).toBe(false);
  });

  it("restores the previous host and extension when native host registration fails", async () => {
    const root = await mkdtemp("/tmp/actspace-rollback-");
    tempDirs.push(root);
    vi.stubEnv("ABB_CHROME_MANIFEST_PATH", join(root, "chrome-host.json"));
    const bundle = join(root, "bundle");
    const dataRoot = join(root, "data");
    await mkdir(join(bundle, "bin"), { recursive: true });
    await mkdir(join(bundle, "extension", "src"), { recursive: true });
    const previous = "#!/bin/sh\necho 'Agent Browser Bridge previous'\n";
    const replacement = "#!/bin/sh\nif [ \"$1\" = install-native-host ]; then exit 1; fi\necho 'Agent Browser Bridge replacement'\n";
    const extensionManifest = await readFile(join(process.cwd(), "../../browser-bridge/apps/chrome-extension/manifest.json"), "utf8");
    const background = "// browser fixture\n";
    await writeFile(join(bundle, "bin", "abb"), replacement);
    await writeFile(join(bundle, "extension", "manifest.json"), extensionManifest);
    await writeFile(join(bundle, "extension", "src", "background.js"), background);
    await writeFile(join(bundle, "manifest.json"), JSON.stringify({ schemaVersion: 1, platform: process.platform, arch: process.arch,
      files: Object.fromEntries(Object.entries({ "bin/abb": replacement, "extension/manifest.json": extensionManifest, "extension/src/background.js": background })
        .map(([path, content]) => [path, createHash("sha256").update(content).digest("hex")])) }));
    const service = new BrowserBridgeService({ dataRoot, bundledRoot: bundle });
    await mkdir(join(service.pluginRoot, "bin"), { recursive: true });
    await mkdir(service.extensionDir, { recursive: true });
    await writeFile(service.binPath, previous, { mode: 0o755 });
    await writeFile(join(service.extensionDir, "manifest.json"), '{"version":"0.2.1"}');
    expect((await service.installBundled()).ok).toBe(false);
    expect(await readFile(service.binPath, "utf8")).toBe(previous);
    expect(await readFile(join(service.extensionDir, "manifest.json"), "utf8")).toBe('{"version":"0.2.1"}');
  });

  it("installs abb and materializes the Browser Bridge skill", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-data-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-source-"));
    tempDirs.push(dataRoot, sourceRoot);
    const sourceAbb = join(sourceRoot, "abb");
    await writeFile(sourceAbb, "#!/bin/sh\necho 'Agent Browser Bridge test help'\n", "utf8");
    await chmod(sourceAbb, 0o755);

    const service = new BrowserBridgeService({ dataRoot });
    const result = await service.installFromFile(sourceAbb);

    expect(result).toMatchObject({ ok: true, abbPath: service.binPath });
    const skill = await readFile(service.skillPath, "utf8");
    expect(skill).toContain("name: browser-bridge");
    expect(skill).toContain(service.binPath);
    expect(skill).toContain("doctor --json");
    expect(skill).toContain("standard `browser_*` tools");
    expect(skill).toContain("Do not invoke `abb` through Bash for tabs");
    expect(service.socketPath).toContain(join("Application Support", "AgentBrowserBridge", "agent-browser-bridge.sock"));
  });

  it("atomically replaces abb without mutating an already-open executable inode", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-data-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-source-"));
    tempDirs.push(dataRoot, sourceRoot);
    const oldSource = join(sourceRoot, "abb-old");
    const newSource = join(sourceRoot, "abb-new");
    const oldScript = "#!/bin/sh\necho 'Agent Browser Bridge old help'\n";
    const newScript = "#!/bin/sh\necho 'Agent Browser Bridge new help'\n";
    await writeFile(oldSource, oldScript, "utf8");
    await writeFile(newSource, newScript, "utf8");
    await chmod(oldSource, 0o755);
    await chmod(newSource, 0o755);

    const service = new BrowserBridgeService({ dataRoot });
    expect((await service.installFromFile(oldSource)).ok).toBe(true);
    const before = await stat(service.binPath);
    const openOldBinary = await open(service.binPath, "r");

    expect((await service.installFromFile(newSource)).ok).toBe(true);
    const after = await stat(service.binPath);
    const oldContent = await openOldBinary.readFile({ encoding: "utf8" });
    await openOldBinary.close();

    expect(after.ino).not.toBe(before.ino);
    expect(oldContent).toBe(oldScript);
    expect(await readFile(service.binPath, "utf8")).toBe(newScript);
  });

  it("keeps the previous abb when the replacement help probe is invalid", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-data-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-source-"));
    tempDirs.push(dataRoot, sourceRoot);
    const validSource = join(sourceRoot, "abb-valid");
    const invalidSource = join(sourceRoot, "abb-invalid");
    const validScript = "#!/bin/sh\necho 'Agent Browser Bridge valid help'\n";
    await writeFile(validSource, validScript, "utf8");
    await writeFile(invalidSource, "#!/bin/sh\necho 'not abb'\n", "utf8");
    await chmod(validSource, 0o755);
    await chmod(invalidSource, 0o755);

    const service = new BrowserBridgeService({ dataRoot });
    expect((await service.installFromFile(validSource)).ok).toBe(true);

    const result = await service.installFromFile(invalidSource);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("输出不包含 Agent Browser Bridge 标识");
    expect(await readFile(service.binPath, "utf8")).toBe(validScript);
  });

  it("deduplicates concurrent status probes for the same repository root", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-data-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-source-"));
    tempDirs.push(dataRoot, sourceRoot);
    const callsPath = join(sourceRoot, "calls.log");
    const sourceAbb = join(sourceRoot, "abb");
    await writeFile(
      sourceAbb,
      [
        "#!/bin/sh",
        `echo \"$1\" >> \"${callsPath}\"`,
        "case \"$1\" in",
        "  help) echo 'Agent Browser Bridge test help' ;;",
        "  doctor) sleep 0.05; echo '{\"summary\":\"ok\",\"checks\":[]}' ;;",
        "  capabilities) echo '{\"phase\":\"test\"}' ;;",
        "esac",
        "",
      ].join("\n"),
      "utf8",
    );
    await chmod(sourceAbb, 0o755);

    const service = new BrowserBridgeService({ dataRoot });
    expect((await service.installFromFile(sourceAbb)).ok).toBe(true);
    await writeFile(callsPath, "", "utf8");
    await writeFile(join(service.pluginRoot, "connection.json"), '{"schemaVersion":1,"enabled":true}');

    const [first, second] = await Promise.all([
      service.getStatus("/repo"),
      service.getStatus("/repo"),
    ]);
    const calls = (await readFile(callsPath, "utf8")).trim().split("\n");

    expect(first).toEqual(second);
    expect(calls).toEqual(["doctor", "capabilities"]);
  });

  it("backs off repeated status probes after a command failure", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-data-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "actspace-browser-bridge-source-"));
    tempDirs.push(dataRoot, sourceRoot);
    const callsPath = join(sourceRoot, "calls.log");
    const sourceAbb = join(sourceRoot, "abb");
    await writeFile(
      sourceAbb,
      [
        "#!/bin/sh",
        "if [ \"$1\" = help ]; then echo 'Agent Browser Bridge test help'; exit 0; fi",
        `echo \"$1\" >> \"${callsPath}\"`,
        "echo 'doctor failed' >&2",
        "exit 1",
        "",
      ].join("\n"),
      "utf8",
    );
    await chmod(sourceAbb, 0o755);

    const service = new BrowserBridgeService({ dataRoot, statusErrorRetryMs: 60_000 });
    expect((await service.installFromFile(sourceAbb)).ok).toBe(true);
    await writeFile(join(service.pluginRoot, "connection.json"), '{"schemaVersion":1,"enabled":true}');

    const first = await service.getStatus("/repo");
    const second = await service.getStatus("/repo");
    const calls = (await readFile(callsPath, "utf8")).trim().split("\n");

    expect(first.runState).toBe("error");
    expect(second).toEqual(first);
    expect(first.lastError).toContain("doctor failed");
    expect(calls).toEqual(["doctor"]);
  });
});
