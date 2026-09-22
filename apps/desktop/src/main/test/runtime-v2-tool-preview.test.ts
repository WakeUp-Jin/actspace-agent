// @vitest-environment node
import { describe, expect, it } from "vitest";
import { workspaceDisplayPath, toolPreview } from "@actspace/client/sessions";

describe("shared live and durable tool previews", () => {
  it.each([
    ["read_file", "read"], ["list_directory", "directory_list"], ["grep", "grep"], ["glob", "glob"],
    ["bash", "bash"], ["bash_output", "bash"], ["bash_kill", "bash"], ["web_search", "web_search"],
    ["web_fetch", "web_search"], ["write_file", "write"], ["edit_file", "edit_diff"], ["delete_file", "delete"],
    ["inspect_image", "media_analysis"], ["generate_image", "image_generation"], ["todo_read", "todo"],
    ["todo_write", "todo"], ["agent", "agent"], ["explore", "agent"], ["plugin.custom", "generic"],
  ])("keeps %s preview kind %s throughout its lifecycle", (name, kind) => {
    for (const phase of ["streaming", "prepared", "running", "finished"] as const) {
      expect(toolPreview(name, undefined, { status: "completed" }, { args: { path: "fixture.txt", content: "text" } }, undefined, "s", "r", phase).kind).toBe(kind);
    }
  });
  it.each([["/work", "."], ["/work/src/a.ts", "src/a.ts"], ["/work-other/a", "/work-other/a"], ["../outside", "/outside"], ["src/../a", "a"]])("displays workspace path %s as %s", (path, expected) => {
    expect(workspaceDisplayPath(path, "/work")).toBe(expected);
  });
  it("uses typed denial/cancellation and does not turn errors into edit diffs", () => {
    for (const name of ["bash", "write_file", "edit_file", "delete_file"]) {
      const preview = toolPreview(name, undefined, { status: "denied", summary: "Permission denied", failure: { message: "Permission denied" }, modelOutput: [{ type: "text", text: "Permission denied" }] }, { args: { path: "fixture.txt" } }, undefined, "s", "r");
      expect(preview).toMatchObject({ status: "denied" });
      if (preview.kind === "write" || preview.kind === "edit_diff") expect(preview.diff).toBe("");
    }
    expect(toolPreview("bash", undefined, { status: "aborted" }, undefined, undefined, "s", "r")).toMatchObject({ status: "cancelled" });
  });
  it("routes Explore and Agent transcripts to the shared subagent panel", () => {
    expect(toolPreview("explore", undefined, { status: "completed" }, { args: { task: "Inspect UI" } }, undefined, "s", "r")).toMatchObject({ kind: "agent", agentKind: "explore", display: "panel" });
    expect(toolPreview("agent", undefined, { status: "completed" }, { args: { task: "Inspect UI" } }, undefined, "s", "r")).toMatchObject({ kind: "agent", agentKind: "agent", display: "panel" });
  });
  it("retains aborted child identity despite a failed tool-body status", () => {
    expect(toolPreview("agent", undefined, { status: "failed", failure: { message: "Cancelled" }, detail: [{ label: "delegation", value: { childSessionId: "child", status: "aborted" } }] }, { args: { task: "Inspect" } }, undefined, "parent", "run")).toMatchObject({ status: "aborted", error: "Cancelled", transcriptRef: { runId: "child" } });
  });
  it("does not turn failed file-tool output into a result preview", () => {
    expect(toolPreview("glob", undefined, { status: "failed", failure: { message: "SEARCH_FAILED" }, modelOutput: [{ type: "text", text: "SEARCH_FAILED" }] }, { args: { pattern: "**/*.md", path: "." } }, undefined, "s", "r")).toMatchObject({ kind: "glob", resultPreview: undefined });
  });
});

describe("compact Bash preview diagnostics", () => {
  it("retains complete summary in details without promoting it to the title", () => {
    const preview = toolPreview("bash", undefined, { status: "completed", summary: "Bash completed in 85ms (exit 0, sandboxed=true).", modelOutput: [{ type: "text", text: "file.txt" }] }, { args: { command: "ls", intent: "Inspect files" } }, undefined, "s", "r");
    expect(preview).toMatchObject({ title: "Bash command", commandPreview: "ls", stdout: "file.txt", reason: "Bash completed in 85ms (exit 0, sandboxed=true).", intent: "Inspect files" });
    expect(preview).not.toHaveProperty("sandboxed");
    expect(preview).not.toHaveProperty("exitCode");
  });
  it.each(["denied", "failed", "aborted"])("retains %s diagnostics even when output and error differ", (status) => {
    const preview = toolPreview("bash", undefined, { status, summary: "Command unsuccessful", failure: { message: "Detailed failure reason" }, modelOutput: [{ type: "text", text: "Partial command output" }] }, { args: { command: "run" } }, undefined, "s", "r");
    expect(preview).toMatchObject({ title: "Bash command", stderr: "Partial command output", reason: "Command unsuccessful\nDetailed failure reason" });
  });
});
