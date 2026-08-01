import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionRecord, listSessionRecords } from "@actspace/agent-core";
import { describe, expect, it } from "vitest";
import { chatCommand } from "../chat";
import { ScriptedLineInput } from "./terminal-test-input";

describe("chatCommand", () => {
  it("uses the current directory when --workspace is omitted", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-chat-cwd-"));
    const dataDir = await mkdtemp(join(tmpdir(), "actspace-chat-data-"));
    const input = new ScriptedLineInput(["/exit"]);

    await expect(chatCommand({
      dataDir,
      permissionMode: "default",
      mock: true,
    }, {
      input,
      write: () => {},
      stdinIsTTY: true,
      stdoutIsTTY: true,
      env: { NO_COLOR: "1" },
      cwd: () => workspace,
    })).resolves.toBe(0);

    const sessions = await listSessionRecords(join(dataDir, "sessions"));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.workspaceRoot).toBe(workspace);
  });

  it("persists multiple turns in one shared session", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-chat-work-"));
    const dataDir = await mkdtemp(join(tmpdir(), "actspace-chat-data-"));
    const input = new ScriptedLineInput(["first", "second", "/exit"]);
    let output = "";
    await expect(chatCommand({
      workspace,
      dataDir,
      permissionMode: "default",
      mock: true,
    }, {
      input,
      write: (text) => { output += text; },
      writeStatus: () => {},
      stdinIsTTY: true,
      stdoutIsTTY: true,
      env: { NO_COLOR: "1" },
    })).resolves.toBe(0);

    const sessions = await listSessionRecords(join(dataDir, "sessions"));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ turnCount: 2, workspaceRoot: workspace });
    expect(output.match(/Mock ActSpace Agent response\./g)).toHaveLength(2);
    expect(input.closed).toBe(true);
  });

  it("supports new and resume without mixing session histories", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-chat-work-"));
    const dataDir = await mkdtemp(join(tmpdir(), "actspace-chat-data-"));
    const sessionRoot = join(dataDir, "sessions");
    const existing = await createSessionRecord(sessionRoot, { workspaceRoot: workspace, title: "Existing" });
    const input = new ScriptedLineInput([
      `/resume ${existing.meta.id}`,
      "resumed turn",
      "/new",
      "new turn",
      "/sessions",
      "/exit",
    ]);
    let status = "";
    await chatCommand({
      workspace,
      dataDir,
      permissionMode: "default",
      mock: true,
    }, {
      input,
      write: () => {},
      writeStatus: (text) => { status += text; },
      stdinIsTTY: true,
      stdoutIsTTY: true,
      env: { NO_COLOR: "1" },
    });

    const sessions = await listSessionRecords(sessionRoot);
    expect(sessions.find((session) => session.id === existing.meta.id)?.turnCount).toBe(1);
    expect(sessions.filter((session) => session.turnCount === 1)).toHaveLength(2);
    expect(status).toContain(existing.meta.id);
  });
});
