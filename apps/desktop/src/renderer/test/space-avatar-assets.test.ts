import { describe, expect, it } from "vitest";
import { SPACE_COLORS, BALL_COLORS, ballColorFor, ballFor, companionFor, hashId, spaceColorAt, spaceImageFor } from "../components/space/avatar/avatar-assets";

describe("space avatar assets", () => {
  it("hashId 和 demo 一致", () => {
    // demo：[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
    expect(hashId("")).toBe(7);
    expect(hashId("a")).toBe(7 * 31 + 97);
  });

  it("ballFor 和 demo 的映射一致", () => {
    expect(ballColorFor("load")).toBe("peach");
    expect(ballColorFor("env")).toBe("ink");
    expect(ballFor("load")).toContain("ball-peach");
    expect(ballFor("env")).toContain("ball-ink");
    expect(ballFor("env")).toBe(ballFor("env"));
  });

  it("颜色顺序固定", () => {
    expect([...SPACE_COLORS]).toEqual(["peach", "forest", "cream", "slate", "blush", "midnight"]);
    expect([...BALL_COLORS]).toEqual(["lilac", "ink", "forest", "peach", "cream"]);
  });

  it("Space 颜色按创建序号轮换", () => {
    expect(spaceColorAt(0)).toBe("peach");
    expect(spaceColorAt(5)).toBe("midnight");
    expect(spaceColorAt(6)).toBe("peach");
    expect(spaceImageFor("forest")).toContain("space-forest");
    expect(spaceImageFor("unknown")).toContain("space-peach");
  });

  it("companionFor 取 1..9 的角色图", () => {
    const all = Array.from({ length: 9 }, (_, i) => companionFor(i + 1));
    expect(new Set(all).size).toBe(9);
    expect(companionFor(2)).toContain("companion-2");
    expect(companionFor(0)).toBe(all[0]);
    expect(companionFor(99)).toBe(all[8]);
  });
});
