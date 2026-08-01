import { describe, expect, it } from "vitest";
import { ripgrepRuntimePath, runtimeAssetDirectory } from "../binary/runtime-paths";

describe("runtime asset paths", () => {
  it("keeps version and target below the external data root", () => {
    expect(runtimeAssetDirectory({
      dataDir: "/tmp/actspace-data",
      version: "0.1.0",
      platform: "darwin",
      arch: "arm64",
    })).toBe("/tmp/actspace-data/runtime/0.1.0/darwin-arm64");
  });

  it("uses the platform executable name", () => {
    expect(ripgrepRuntimePath({
      dataDir: "/tmp/data",
      version: "0.1.0",
      platform: "linux",
      arch: "x64",
    })).toMatch(/\/rg$/);
    expect(ripgrepRuntimePath({
      dataDir: "C:\\data",
      version: "0.1.0",
      platform: "win32",
      arch: "x64",
    })).toMatch(/rg\.exe$/);
  });
});
