import { describe, expect, it } from "vitest";
import { parseCliArgs, usage } from "../args";

describe("parseCliArgs", () => {
  it("parses run options", () => {
    const parsed = parseCliArgs([
      "run",
      "--input",
      "hello",
      "--workspace",
      "/tmp/work",
      "--permission-mode",
      "yolo",
      "--json",
      "--data-dir",
      "/tmp/data",
      "--out",
      "/tmp/out",
      "--mock",
    ]);

    expect(parsed.command).toBe("run");
    expect(parsed.options).toMatchObject({
      input: "hello",
      workspace: "/tmp/work",
      permissionMode: "yolo",
      outputFormat: "json",
      out: "/tmp/out",
      dataDir: "/tmp/data",
      mock: true,
    });
  });

  it("rejects invalid permission mode", () => {
    expect(() => parseCliArgs(["run", "--permission-mode", "wild"])).toThrow(/Invalid permission mode/);
  });

  it("keeps JSON and JSONL mutually exclusive", () => {
    expect(() => parseCliArgs(["run", "--json", "--jsonl"])).toThrow(/only one/);
  });

  it("supports a standalone version command", () => {
    expect(parseCliArgs(["--version"])).toEqual({ command: "version" });
  });

  it("parses persistent and resume v2 run controls", () => {
    expect(parseCliArgs(["run", "--input", "next", "--persist"])).toMatchObject({ command: "run", options: { persist: true } });
    expect(parseCliArgs(["run", "--input", "next", "--resume", "session-1"])).toMatchObject({ command: "run", options: { persist: true, resume: "session-1" } });
    expect(() => parseCliArgs(["run", "--resume"])).toThrow("Missing value");
  });

  it("documents optional workspace and valid stdin piping", () => {
    expect(usage()).toContain("[--workspace <path>]");
    expect(usage()).toContain("<task> | actspace-agent run");
    expect(usage()).not.toContain("<task actspace-agent");
  });
});
