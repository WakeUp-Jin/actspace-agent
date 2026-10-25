import { describe, expect, it } from "vitest";
import { createMessageBlocks } from "@actspace/shared";
import { toolPreview } from "../sessions/tool-card.js";
import { toolEntryToBlock } from "../live/stream-blocks.js";

function directoryPreview(output: string, status = "completed") {
  return toolPreview("list_directory", undefined, {
    status, summary: "Listed empty", modelOutput: [{ type: "text", text: output }],
  }, { args: { path: "empty" } }, undefined, "session", "run");
}

describe("directory result counts", () => {
  it.each([
    ["(empty directory)", 0],
    ["\n(empty directory)\n", 0],
    ["[file] (empty directory)", 1],
    ["[file] a.txt\n[dir]  sub\n", 2],
    ["", undefined],
  ])("counts actual entries for %j", (output, entryCount) => {
    expect(directoryPreview(output)).toMatchObject({ kind: "directory_list", entryCount });
  });

  it("does not count failure diagnostics as entries", () => {
    expect(directoryPreview("The requested filesystem resource does not exist.", "failed"))
      .toMatchObject({ kind: "directory_list", entryCount: undefined });
  });

  it("retains zero through live and persisted projections", () => {
    const preview = directoryPreview("(empty directory)");
    const live = toolEntryToBlock("call", { toolName: "list_directory", preview, finished: true }, "now", "run");
    const [persisted] = createMessageBlocks([{
      id: "result", type: "tool_result", schemaVersion: 2, sessionId: "session", agentRunId: "run", timestamp: "now",
      payload: { toolName: "list_directory", ok: true, summary: "Listed empty", uiPreview: preview },
    }]);
    expect(live).toMatchObject({ kind: "directory_list", entryCount: 0, status: "completed" });
    expect(persisted).toMatchObject({ kind: "directory_list", entryCount: 0, status: "completed" });
  });
});
