import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { writeArtifacts } from "../artifacts";

describe("writeArtifacts", () => {
  it("writes result, trace, and final response", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "actspace-agent-cli-artifacts-"));
    await writeArtifacts({
      outDir,
      result: {
        schemaVersion: 1,
        ok: true,
        status: "completed",
        exitCode: 0,
        sessionId: "session-1",
        agentRunId: "run-1",
        finalText: "Done",
        messageCount: 1,
        eventCount: 1,
        permissionMode: "default",
        workspace: "/tmp/work",
        startedAt: "2026-07-08T00:00:00.000Z",
        endedAt: "2026-07-08T00:00:01.000Z",
      },
      events: [
        {
          timestamp: "2026-07-08T00:00:00.000Z",
          source: "runtime",
          event: { type: "agent_run_started", sessionId: "session-1", agentRunId: "run-1" },
        },
      ],
      finalText: "Done",
      contextSnapshots: [{
        id: "001-final",
        kind: "final",
        messageCount: 1,
        tokenEstimate: 2,
        compacted: false,
        toolCallIds: [],
        messages: [{ role: "user", content: "Say hi", timestamp: 1 }],
      }],
    });

    await expect(readFile(join(outDir, "result.json"), "utf8")).resolves.toContain('"ok": true');
    await expect(readFile(join(outDir, "trace.jsonl"), "utf8")).resolves.toContain('"source":"runtime"');
    await expect(readFile(join(outDir, "final-response.md"), "utf8")).resolves.toBe("Done");
    await expect(readFile(join(outDir, "context-snapshots", "001-final.json"), "utf8"))
      .resolves.toContain('"messageCount": 1');
  });
});
