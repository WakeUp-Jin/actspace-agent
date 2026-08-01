import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runCommand } from "../run";

describe("runCommand", () => {
  it("uses the current directory when --workspace is omitted", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-agent-cli-cwd-"));
    const result = await runCommand({
      input: "Say hi",
      permissionMode: "default",
      outputFormat: "text",
      mock: true,
    }, {
      cwd: () => workspace,
    });

    expect(result.workspace).toBe(workspace);
    expect(result.exitCode).toBe(0);
  });

  it("runs in mock mode without writing artifacts when --out is absent", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-agent-cli-work-"));
    const result = await runCommand({
      input: "Say hi",
      workspace,
      permissionMode: "default",
      outputFormat: "text",
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
      outputFormat: "text",
      out,
      mock: true,
    });

    expect(result.ok).toBe(true);
    await expect(readFile(join(out, "result.json"), "utf8")).resolves.toContain('"permissionMode": "yolo"');
    await expect(readFile(join(out, "trace.jsonl"), "utf8")).resolves.toContain('"source":"runtime"');
    await expect(readFile(join(out, "trace.jsonl"), "utf8")).resolves.toContain('"source":"harness"');
    await expect(readFile(join(out, "final-response.md"), "utf8")).resolves.toBe("Mock ActSpace Agent response.");
    const snapshotNames = await readdir(join(out, "context-snapshots"));
    expect(snapshotNames.some((name) => name.includes("pre-llm"))).toBe(true);
    expect(snapshotNames.some((name) => name.includes("final"))).toBe(true);
    const preLlm = snapshotNames.find((name) => name.includes("pre-llm"));
    await expect(readFile(join(out, "context-snapshots", preLlm ?? ""), "utf8"))
      .resolves.toContain('"kind": "pre-llm"');
  });

  it("accepts non-TTY stdin without probing it when an explicit input is present", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-agent-cli-work-"));
    const result = await runCommand({
      workspace,
      permissionMode: "default",
      outputFormat: "text",
      mock: true,
    }, {
      stdinIsTTY: false,
      readStdin: async () => "Say hi from stdin",
    });

    expect(result.exitCode).toBe(0);
    let stdinRead = false;
    await expect(runCommand({
      input: "flag input",
      workspace,
      permissionMode: "default",
      outputFormat: "text",
      mock: true,
    }, {
      stdinIsTTY: false,
      readStdin: async () => {
        stdinRead = true;
        return "piped input";
      },
    })).resolves.toMatchObject({ exitCode: 0 });
    expect(stdinRead).toBe(false);
  });
});
