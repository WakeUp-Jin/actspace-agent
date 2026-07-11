// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserBridgeService } from "../plugins/browser-bridge-service";

describe("BrowserBridgeService", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
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

    const first = await service.getStatus("/repo");
    const second = await service.getStatus("/repo");
    const calls = (await readFile(callsPath, "utf8")).trim().split("\n");

    expect(first.runState).toBe("error");
    expect(second).toEqual(first);
    expect(first.lastError).toContain("doctor failed");
    expect(calls).toEqual(["doctor"]);
  });
});
