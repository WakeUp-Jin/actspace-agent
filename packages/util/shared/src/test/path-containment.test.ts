import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { isLexicallyInside, type PathRules, relativePathInside } from "../path-containment";

const posix: PathRules = nodePath.posix;
const win32: PathRules = nodePath.win32;

describe("relativePathInside", () => {
  it.each([
    ["/w", "/w", ""],
    ["/w", "/w/a", "a"],
    ["/w", "/w/a/b.txt", "a/b.txt"],
    ["/w/", "/w/a/", "a"],
    ["/", "/a", "a"],
    ["/", "/", ""],
    // 名字以两个点开头的文件和目录是合法的，不是往上走。
    ["/w", "/w/..foo", "..foo"],
    ["/w", "/w/..foo/bar", "..foo/bar"],
    ["/w", "/w/...", "..."],
    // 先折叠 `..` 再比较。
    ["/w", "/w/../w/a", "a"],
    ["/w", "/w/a/../../etc", null],
    ["/w", "/w/..", null],
    // 名字有共同前缀的兄弟目录不在里面。
    ["/w", "/wx", null],
    ["/w", "/", null],
    ["/w/a", "/w", null],
    // POSIX 区分大小写；反斜杠是普通字符。
    ["/w", "/W/a", null],
    ["/w", "/w/a\\..\\b", "a\\..\\b"],
  ])("posix: %j 里的 %j → %j", (root, candidate, expected) => {
    expect(relativePathInside(posix, root, candidate)).toBe(expected);
  });

  it.each([
    ["C:\\w", "C:\\w", ""],
    ["C:\\w", "C:\\w\\a", "a"],
    ["C:\\", "C:\\a", "a"],
    ["C:\\w", "C:\\w\\..foo", "..foo"],
    // Windows 不分大小写，正斜杠也是分隔符。
    ["C:\\w", "c:\\W\\A", "A"],
    ["C:\\w", "C:/w/a/b", "a\\b"],
    ["\\\\server\\share\\w", "\\\\server\\share\\w\\a", "a"],
    // 往上走的前缀是 `..\`，只认 `../` 的写法在这里会漏掉。
    ["C:\\w", "C:\\wx", null],
    ["C:\\w", "C:\\", null],
    ["C:\\w", "C:\\w\\a\\..\\..\\etc", null],
    // 跨盘符、跨共享时 relative 返回绝对路径或 `..\..\…`，都不在里面。
    ["C:\\w", "D:\\w\\a", null],
    ["C:\\w", "\\\\server\\share\\w", null],
    ["\\\\server\\share\\w", "C:\\w", null],
    ["\\\\server\\share\\w", "\\\\server\\other\\a", null],
  ])("win32: %j 里的 %j → %j", (root, candidate, expected) => {
    expect(relativePathInside(win32, root, candidate)).toBe(expected);
  });

  it("resolves relative inputs against the working directory, as path.relative does", () => {
    expect(relativePathInside(posix, "w", "w/a")).toBe("a");
    expect(relativePathInside(posix, ".", "a/../b")).toBe("b");
    expect(relativePathInside(posix, ".", "..")).toBeNull();
    expect(relativePathInside(posix, "w", "/w")).toBeNull();
  });
});

describe("isLexicallyInside", () => {
  it("counts the root itself only when includeRoot is true", () => {
    for (const [rules, root, child, sibling] of [
      [posix, "/w", "/w/a", "/wx"],
      [win32, "C:\\w", "C:\\w\\a", "C:\\wx"],
    ] as const) {
      expect(isLexicallyInside(rules, root, root, { includeRoot: true })).toBe(true);
      expect(isLexicallyInside(rules, root, root, { includeRoot: false })).toBe(false);
      for (const includeRoot of [true, false]) {
        expect(isLexicallyInside(rules, root, child, { includeRoot })).toBe(true);
        expect(isLexicallyInside(rules, root, sibling, { includeRoot })).toBe(false);
      }
    }
  });

  it("treats a differently spelled root as the root", () => {
    expect(isLexicallyInside(posix, "/w", "/w/a/..", { includeRoot: false })).toBe(false);
    expect(isLexicallyInside(posix, "/w", "/w/", { includeRoot: true })).toBe(true);
    expect(isLexicallyInside(win32, "C:\\w", "c:/W/", { includeRoot: false })).toBe(false);
  });
});

/**
 * 对照检查：在一个小字母表上穷举所有的根和候选路径，结果要和「先折叠再逐段比较」一致。
 * 逐段比较不经过 `relative`，两边的实现互相独立。
 */
describe("exhaustive comparison with a segment-by-segment check", () => {
  function sequences(alphabet: readonly string[], maxLength: number): string[][] {
    let level: string[][] = [[]];
    const all: string[][] = [[]];
    for (let length = 1; length <= maxLength; length += 1) {
      level = level.flatMap((prefix) => alphabet.map((segment) => [...prefix, segment]));
      all.push(...level);
    }
    return all;
  }

  /** 折叠 `.` 和 `..`；已经在根上再往上还是根。 */
  function fold(segments: readonly string[]): string[] {
    const folded: string[] = [];
    for (const segment of segments) {
      if (segment === "..") folded.pop();
      else if (segment !== ".") folded.push(segment);
    }
    return folded;
  }

  function segmentsInside(
    root: readonly string[],
    candidate: readonly string[],
    sameName: (left: string, right: string) => boolean,
  ): string[] | null {
    const foldedRoot = fold(root);
    const foldedCandidate = fold(candidate);
    if (foldedCandidate.length < foldedRoot.length) return null;
    if (!foldedRoot.every((segment, index) => sameName(segment, foldedCandidate[index] ?? ""))) return null;
    return foldedCandidate.slice(foldedRoot.length);
  }

  function compare(
    rules: PathRules,
    root: string,
    candidate: string,
    expected: string | null,
    seen: Record<"same" | "inside" | "outside", number>,
    mismatches: string[],
  ): void {
    seen[expected === null ? "outside" : expected === "" ? "same" : "inside"] += 1;
    const actual = relativePathInside(rules, root, candidate);
    const withRoot = isLexicallyInside(rules, root, candidate, { includeRoot: true });
    const withoutRoot = isLexicallyInside(rules, root, candidate, { includeRoot: false });
    if (
      actual !== expected ||
      withRoot !== (expected !== null) ||
      withoutRoot !== (expected !== null && expected !== "")
    ) {
      mismatches.push(
        `${JSON.stringify(root)} / ${JSON.stringify(candidate)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }

  it("posix", () => {
    const alphabet = ["a", "b", "..", ".", "..a", "a..", "..."];
    const seen = { same: 0, inside: 0, outside: 0 };
    const mismatches: string[] = [];
    for (const root of sequences(alphabet, 2)) {
      for (const candidate of sequences(alphabet, 3)) {
        const expected = segmentsInside(root, candidate, (left, right) => left === right);
        compare(
          posix,
          `/${root.join("/")}`,
          `/${candidate.join("/")}`,
          expected === null ? null : expected.join("/"),
          seen,
          mismatches,
        );
      }
    }
    expect(mismatches).toEqual([]);
    expect(seen.same + seen.inside + seen.outside).toBe(57 * 400);
    expect(Math.min(seen.same, seen.inside, seen.outside)).toBeGreaterThan(0);
  });

  it("win32", () => {
    const alphabet = ["a", "A", "b", "..", ".", "..a"];
    const sameName = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
    const seen = { same: 0, inside: 0, outside: 0 };
    const mismatches: string[] = [];
    for (const root of sequences(alphabet, 2)) {
      for (const candidate of sequences(alphabet, 3)) {
        for (const drive of ["C:", "c:", "D:"]) {
          for (const separator of ["\\", "/"]) {
            const inside = sameName(drive, "C:") ? segmentsInside(root, candidate, sameName) : null;
            compare(
              win32,
              `C:\\${root.join("\\")}`,
              `${drive}${separator}${candidate.join(separator)}`,
              inside === null ? null : inside.join("\\"),
              seen,
              mismatches,
            );
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(seen.same + seen.inside + seen.outside).toBe(43 * 259 * 6);
    expect(Math.min(seen.same, seen.inside, seen.outside)).toBeGreaterThan(0);
  });
});
