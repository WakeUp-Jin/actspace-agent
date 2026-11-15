import { describe, expect, it } from "vitest";
import { subagentToolNames } from "../preset.js";

const registered = ["read_file", "list_directory", "grep", "glob", "web_search", "deep_search", "send_message", "agent"];

describe("subagentToolNames", () => {
  it("gives general subagents deep_search when the parent allows it, never explore", () => {
    const parent = ["read_file", "web_search", "deep_search", "agent"];
    expect(subagentToolNames("general", parent, registered)).toEqual(["deep_search", "read_file", "send_message", "web_search"]);
    expect(subagentToolNames("explore", parent, registered)).not.toContain("deep_search");
  });

  it("leaves deep_search out of both presets when it is hidden from the registered list", () => {
    const parent = ["read_file", "deep_search"];
    const hidden = registered.filter(name => name !== "deep_search");
    expect(subagentToolNames("general", parent, hidden)).toEqual(["read_file", "send_message"]);
    expect(subagentToolNames("explore", parent, hidden)).not.toContain("deep_search");
  });
});
