import { describe, expect, it } from "vitest";
import { createMessageBlocks, type ToolUiPreview } from "@actspace/shared";
import type { RuntimeV2ToolView } from "@actspace/shared/runtime-v2";
import { toolPreview } from "../sessions/tool-card.js";

describe("Browser screenshot projection", () => {
  it("preserves the artifact reference through the preview and persisted message", () => {
    const tool = { state: "completed", summary: "Captured", artifacts: [{ kind: "image", artifactId: "shot-id", label: "cua.screenshot", mimeType: "image/jpeg" }] } as RuntimeV2ToolView;
    const preview: ToolUiPreview = toolPreview("browser_cua", tool, { status: "completed" }, undefined, undefined, "session", "run");
    expect(preview).toMatchObject({ kind: "generic", artifacts: [{ type: "image", name: "Chrome 截图", path: "shot-id", mimeType: "image/jpeg" }] });
    const blocks = createMessageBlocks([{ id: "result", type: "tool_result", schemaVersion: 2, sessionId: "session", agentRunId: "run", timestamp: "now", payload: { toolName: "browser_cua", ok: true, summary: "Captured", uiPreview: preview } }]);
    expect(blocks[0]).toMatchObject({ kind: "tool", artifacts: [{ path: "shot-id" }] });
  });
});
