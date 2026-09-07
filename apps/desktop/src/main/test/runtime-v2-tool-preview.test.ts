// @vitest-environment node
import { describe, expect, it } from "vitest";
import { workspaceDisplayPath, toolPreview } from "../runtime-v2/fixed-renderer-tool-preview";

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
});
