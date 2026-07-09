import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../args";

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
      "--out",
      "/tmp/out",
      "--mock",
    ]);

    expect(parsed.command).toBe("run");
    expect(parsed.options).toMatchObject({
      input: "hello",
      workspace: "/tmp/work",
      permissionMode: "yolo",
      json: true,
      out: "/tmp/out",
      mock: true,
    });
  });

  it("rejects invalid permission mode", () => {
    expect(() => parseCliArgs(["run", "--permission-mode", "wild"])).toThrow(/Invalid permission mode/);
  });
});
