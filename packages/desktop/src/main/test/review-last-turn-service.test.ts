import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { appendEvent, createSessionRecord, createSessionStorePaths } from "@actspace/agent-core";
import type { SessionEvent, ToolExecutionResult } from "@actspace/shared";
import { ReviewLastTurnService } from "../review-last-turn-service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ReviewLastTurnService", () => {
  it("restores only the requested turn and exposes its stored patch", async () => {
    const root = await mkdtemp(join(tmpdir(), "review-last-turn-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const sessionRoot = join(root, "sessions");
    const record = await createSessionRecord(sessionRoot, { workspaceRoot });
    const paths = createSessionStorePaths(join(sessionRoot, record.meta.id));
    await appendEvent(paths.sessionPath, toolResult(record.meta.id, "turn-1", "old.md", "+old"));
    await appendEvent(paths.sessionPath, toolResult(record.meta.id, "turn-2", "docs/你好 file.md", "+new"));

    const service = new ReviewLastTurnService(sessionRoot);
    const snapshot = await service.getSnapshot({
      workspaceId: "workspace-1",
      workspaceRoot,
      selection: { kind: "lastTurn", sessionId: record.meta.id, turnId: "turn-2" },
      generation: 3,
    });

    expect(snapshot.status).toBe("ready");
    expect(snapshot.files).toEqual([
      expect.objectContaining({ path: "docs/你好 file.md", additions: 1, source: "turn" }),
    ]);
    const result = await service.getFileDiff({ snapshot, fileId: snapshot.files[0].id });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.hunks[0].lines.some((line) => line.text === "new")).toBe(true);
  });

  it("ignores stored previews outside the selected workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "review-last-turn-outside-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const sessionRoot = join(root, "sessions");
    const record = await createSessionRecord(sessionRoot, { workspaceRoot });
    const paths = createSessionStorePaths(join(sessionRoot, record.meta.id));
    await appendEvent(paths.sessionPath, toolResult(record.meta.id, "turn-1", join(root, "outside.md"), "+outside"));

    const service = new ReviewLastTurnService(sessionRoot);
    const snapshot = await service.getSnapshot({
      workspaceId: "workspace-1",
      workspaceRoot,
      selection: { kind: "lastTurn", sessionId: record.meta.id },
      generation: 1,
    });

    expect(snapshot.files).toEqual([]);
    expect(snapshot.status).toBe("partial");
    expect(snapshot.warnings?.[0].kind).toBe("ignored_path");
  });
});

function toolResult(sessionId: string, turnId: string, filePath: string, addedLine: string): SessionEvent<ToolExecutionResult> {
  return {
    id: `${turnId}-${filePath}`,
    sessionId,
    agentRunId: `run-${turnId}`,
    turnId,
    type: "tool_result",
    timestamp: new Date().toISOString(),
    schemaVersion: 2,
    payload: {
      toolName: "write_file",
      ok: true,
      summary: `Write ${filePath}`,
      uiPreview: {
        kind: "write",
        filePath,
        additions: 1,
        deletions: 0,
        collapsedLines: 0,
        status: "completed",
        diff: `diff --git a/${filePath} b/${filePath}\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1 @@\n${addedLine}\n`,
      },
    },
  };
}
