import { describe, expect, it } from "vitest";
import { resolveActSpaceDataRoot } from "../data-root";

describe("resolveActSpaceDataRoot", () => {
  it("uses an explicit data directory before environment and platform defaults", () => {
    expect(resolveActSpaceDataRoot({ explicit: "/tmp/custom", env: { ACTSPACE_DATA_DIR: "/tmp/env" }, platform: "darwin", homeDir: "/Users/me" })).toBe("/tmp/custom");
  });

  it("uses ACTSPACE_DATA_DIR before the platform default", () => {
    expect(resolveActSpaceDataRoot({ env: { ACTSPACE_DATA_DIR: "/tmp/env" }, platform: "darwin", homeDir: "/Users/me" })).toBe("/tmp/env");
  });

  it("uses the same ActSpace directory on macOS as Electron userData", () => {
    expect(resolveActSpaceDataRoot({ platform: "darwin", homeDir: "/Users/me" })).toBe("/Users/me/Library/Application Support/ActSpace");
  });

  it("uses XDG data home on Linux", () => {
    expect(resolveActSpaceDataRoot({ env: { XDG_DATA_HOME: "/home/me/.local/share" }, platform: "linux", homeDir: "/home/me" })).toBe("/home/me/.local/share/ActSpace");
  });

  it("uses the Windows roaming data directory", () => {
    expect(resolveActSpaceDataRoot({ env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, platform: "win32", homeDir: "C:\\Users\\me" })).toBe("C:\\Users\\me\\AppData\\Roaming\\ActSpace");
  });
});
