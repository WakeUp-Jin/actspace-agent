import { describe, expect, it } from "vitest";
import { extractPathsFromArgs } from "../extract-paths";

describe("extractPathsFromArgs (fallback)", () => {
  it("picks 'path' field by default", () => {
    expect(extractPathsFromArgs({ path: "a.txt" })).toEqual(["a.txt"]);
  });

  it("supports filePath/file/dir/cwd as aliases", () => {
    expect(extractPathsFromArgs({ filePath: "a" })).toEqual(["a"]);
    expect(extractPathsFromArgs({ file: "b" })).toEqual(["b"]);
    expect(extractPathsFromArgs({ dir: "c" })).toEqual(["c"]);
    expect(extractPathsFromArgs({ cwd: "d" })).toEqual(["d"]);
  });

  it("aggregates 'files' / 'paths' arrays", () => {
    expect(extractPathsFromArgs({ files: ["a", "b"], paths: ["c"] })).toEqual(["a", "b", "c"]);
  });

  it("ignores non-string / empty / wrong-type fields", () => {
    expect(
      extractPathsFromArgs({
        path: "",
        filePath: 123,
        files: [1, "valid", null],
      }),
    ).toEqual(["valid"]);
  });

  it("returns [] when nothing recognizable", () => {
    expect(extractPathsFromArgs({ query: "kairos", count: 3 })).toEqual([]);
  });
});
