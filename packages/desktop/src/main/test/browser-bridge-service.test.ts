// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    expect(skill).toContain("Prefer the abb CLI through bash");
  });
});
