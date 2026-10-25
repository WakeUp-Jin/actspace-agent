import { describe, expect, it } from "vitest";
import { toolPreview } from "../sessions/tool-card.js";
import { toolEntryToBlock } from "../live/stream-blocks.js";

const launched = { status: "completed", summary: "Started background task", detail: [{ label: "background-task", value: { taskId: "bash_1" } }] };

function bashPreview(data: Record<string, unknown>, background?: { readonly status: string }) {
  return toolPreview("bash", undefined, data as never, { args: { command: "sleep 35" } }, undefined, "session", "run", "finished", undefined, undefined, background);
}

function liveStatus(preview: ReturnType<typeof bashPreview>, tool: { finished?: boolean; isError?: boolean; approvalPending?: boolean } = { finished: true }) {
  return toolEntryToBlock("call", { toolName: "bash", preview, ...tool }, "now", "run");
}

describe("background Bash card status", () => {
  it("stays running after the launcher returns while the task has not settled", () => {
    expect(liveStatus(bashPreview(launched))).toMatchObject({ kind: "bash", status: "running", background: true });
  });

  it.each([
    ["completed", "success"],
    ["failed", "failed"],
    ["stopped", "cancelled"],
    ["lost", "cancelled"],
  ])("follows the settled task status %s", (task, card) => {
    expect(liveStatus(bashPreview(launched, { status: task }))).toMatchObject({ status: card });
  });

  it("keeps foreground success and failure from the tool result", () => {
    expect(liveStatus(bashPreview({ status: "completed", summary: "ok" }))).toMatchObject({ status: "success" });
    expect(liveStatus(bashPreview({ status: "failed", summary: "exit 1" }), { finished: true, isError: true })).toMatchObject({ status: "failed" });
  });

  it("keeps approval and cancellation states", () => {
    expect(liveStatus(bashPreview(launched), { approvalPending: true })).toMatchObject({ status: "pending" });
    expect(liveStatus(bashPreview({ status: "denied", summary: "denied" }), { finished: true, isError: true })).toMatchObject({ status: "denied" });
    expect(liveStatus(bashPreview({ status: "aborted", summary: "aborted" }), { finished: true, isError: true })).toMatchObject({ status: "cancelled" });
  });
});
