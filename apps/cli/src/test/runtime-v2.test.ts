import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setRuntimeV2LoaderForTest } from "../runtime-v2/loader";
import { runV2Command } from "../runtime-v2/run";

beforeEach(() => { setRuntimeV2LoaderForTest(() => import("@actspace/runtime")); });
afterEach(() => { setRuntimeV2LoaderForTest(); });

describe("Runtime v2 CLI candidate", () => {
  it("keeps default run ephemeral and persists only when requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-v2-cli-work-")); const dataDir = await mkdtemp(join(tmpdir(), "actspace-v2-cli-data-"));
    const ephemeral = await runV2Command({ input: "hello", workspace, dataDir, permissionMode: "default", outputFormat: "json", mock: true });
    expect(ephemeral).toMatchObject({ ok: true, persistent: false, finalText: "Mock ActSpace Agent response." });
    expect(ephemeral).toMatchObject({
      reason: "completed",
      steps: 1,
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
    expect(await readdir(dataDir)).toEqual([]);
    const persistent = await runV2Command({ input: "first", workspace, dataDir, permissionMode: "default", outputFormat: "json", mock: true, persist: true });
    expect(persistent.persistent).toBe(true);
    const journal = await readFile(join(dataDir, "sessions-v2", persistent.sessionId, "journal.jsonl"), "utf8");
    expect(journal).toContain('"recordKind":"header"');
    expect(journal).toContain('"type":"turn/start"');
    expect(journal).toContain('"type":"request/header"');
    expect(journal).toContain('"type":"assistant/chunk"');
    expect(journal).toContain('"type":"session/end-seed"');
    const eventTypes = journal.trim().split("\n").map((line) => JSON.parse(line) as { recordKind?: string; type?: string }).filter((row) => row.recordKind === "event").map((row) => row.type);
    expect(eventTypes.indexOf("agent/inbox/spliced")).toBeGreaterThanOrEqual(0);
    expect(eventTypes.indexOf("agent/inbox/spliced")).toBeLessThan(eventTypes.indexOf("turn/start"));
    const resumed = await runV2Command({ input: "second", workspace, dataDir, permissionMode: "default", outputFormat: "json", mock: true, resume: persistent.sessionId });
    expect(resumed.sessionId).toBe(persistent.sessionId);
    expect(resumed.messageCount).toBeGreaterThan(persistent.messageCount);
  });

});
