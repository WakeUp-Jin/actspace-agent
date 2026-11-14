import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setRuntimeLoaderForTest } from "../runtime-v2/loader";
import { runCommand } from "../runtime-v2/run";

beforeEach(() => {
  setRuntimeLoaderForTest(() => import("@actspace/runtime"));
});
afterEach(() => {
  setRuntimeLoaderForTest();
});

describe("Runtime v2 CLI candidate", () => {
  it("keeps default run ephemeral and persists only when requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-v2-cli-work-"));
    const dataDir = await mkdtemp(join(tmpdir(), "actspace-v2-cli-data-"));
    const ephemeral = await runCommand({
      input: "hello",
      workspace,
      dataDir,
      permissionMode: "default",
      outputFormat: "json",
      mock: true,
    });
    expect(ephemeral).toMatchObject({ ok: true, persistent: false, finalText: "Mock ActSpace Agent response." });
    expect(ephemeral).toMatchObject({
      outcome: "completed",
      value: expect.objectContaining({ finalText: "Mock ActSpace Agent response." }),
      snapshot: {
        sessionId: ephemeral.sessionId,
        messages: [{ kind: "user" }, { kind: "assistant" }],
        tools: [],
        pendingInbox: [],
        todos: [],
        delegations: [],
      },
    });
    expect(ephemeral.totalUsage).toEqual(ephemeral.snapshot?.usage);
    expect(ephemeral.messageCount).toBe(ephemeral.snapshot?.messages.length);
    // Host Harness code and selection persist independently of ephemeral conversation data.
    expect(await readdir(dataDir)).toEqual(["harness-artifacts", "harness-state"]);
    const persistent = await runCommand({
      input: "first",
      workspace,
      dataDir,
      permissionMode: "full-access",
      permissionModeExplicit: true,
      outputFormat: "json",
      mock: true,
      persist: true,
    });
    expect(persistent.persistent).toBe(true);
    expect(persistent.permissionMode).toBe("full-access");
    const journal = await readFile(join(dataDir, "sessions-v2", persistent.sessionId, "journal.jsonl"), "utf8");
    expect(journal).toContain('"recordKind":"header"');
    expect(journal).toContain('"type":"turn/start"');
    expect(journal).toContain('"type":"permission/mode-set"');
    expect(journal).toContain('"type":"request/header"');
    // 正文流不写日志，只写定稿的消息（agent-spec-live-assistant-stream.md）。
    expect(journal).not.toContain('"type":"assistant/chunk"');
    expect(journal).toContain('"type":"assistant/message"');
    expect(journal).toContain('"type":"session/end-seed"');
    const eventTypes = journal
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { recordKind?: string; type?: string })
      .filter((row) => row.recordKind === "event")
      .map((row) => row.type);
    expect(eventTypes).not.toContain("agent/inbox/spliced");
    expect(eventTypes.indexOf("plugin/actspace.agent-service/task")).toBeGreaterThanOrEqual(0);
    expect(eventTypes).toContain("user/message");
    expect(eventTypes.indexOf("user/message")).toBeLessThan(eventTypes.indexOf("turn/start"));
    expect(eventTypes).toContain("plugin/actspace.agent-service/run");
    const resumed = await runCommand({
      input: "second",
      workspace,
      dataDir,
      permissionMode: "default",
      outputFormat: "json",
      mock: true,
      resume: persistent.sessionId,
    });
    expect(resumed.sessionId).toBe(persistent.sessionId);
    expect(resumed.permissionMode).toBe("full-access");
    expect(resumed.messageCount).toBeGreaterThan(persistent.messageCount);
  }, 30_000);
});
