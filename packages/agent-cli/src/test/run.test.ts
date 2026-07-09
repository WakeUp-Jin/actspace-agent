import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runCommand } from "../run";

describe("runCommand", () => {
  it("runs in mock mode without writing artifacts when --out is absent", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-agent-cli-work-"));
    const result = await runCommand({
      input: "Say hi",
      workspace,
      permissionMode: "default",
      json: false,
      mock: true,
    });

    expect(result.ok).toBe(true);
    expect(result.finalText).toBe("Mock ActSpace Agent response.");
    expect(await readdir(workspace)).toEqual([]);
  });

  it("writes artifacts when --out is present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-agent-cli-work-"));
    const out = await mkdtemp(join(tmpdir(), "actspace-agent-cli-out-"));

    const result = await runCommand({
      input: "Say hi",
      workspace,
      permissionMode: "yolo",
      json: false,
      out,
      mock: true,
    });

    expect(result.ok).toBe(true);
    await expect(readFile(join(out, "result.json"), "utf8")).resolves.toContain('"permissionMode": "yolo"');
    await expect(readFile(join(out, "trace.jsonl"), "utf8")).resolves.toContain('"agent_start"');
    await expect(readFile(join(out, "final-response.md"), "utf8")).resolves.toBe("Mock ActSpace Agent response.");
    await expect(readFile(join(out, "context-snapshots", "001-final.json"), "utf8"))
      .resolves.toContain('"kind": "final"');
  });
});
