import { describe, expect, it } from "vitest";
import { createBlocklistMatcher, globToRegex, matchesAnyGlob } from "../blocklist-check";

describe("globToRegex", () => {
  it("translates ** to greedy any-segment", () => {
    const re = globToRegex("**/secret/**");
    expect(re.test("/Users/x/secret/y.txt")).toBe(true);
    expect(re.test("/Users/x/public/y.txt")).toBe(false);
  });

  it("translates * to single-segment wildcard", () => {
    const re = globToRegex("*.env");
    expect(re.test(".env")).toBe(true);
    expect(re.test("config.env")).toBe(true);
    expect(re.test("src/.env")).toBe(false);                // contains '/'
  });

  it("supports literal escape for regex meta chars", () => {
    const re = globToRegex("a.txt");
    expect(re.test("a.txt")).toBe(true);
    expect(re.test("ab+txt")).toBe(false);
    expect(re.test("aatxt")).toBe(false);                   // '.' is literal, not regex .
  });

  it("? matches a single non-slash char", () => {
    const re = globToRegex("?.md");
    expect(re.test("a.md")).toBe(true);
    expect(re.test("ab.md")).toBe(false);
    expect(re.test("/.md")).toBe(false);
  });
});

describe("matchesAnyGlob", () => {
  it("returns true on any match", () => {
    expect(matchesAnyGlob("secret/key.pem", ["**/*.env", "**/secret/**"])).toBe(true);
  });
  it("returns false when nothing matches", () => {
    expect(matchesAnyGlob("README.md", ["**/*.env"])).toBe(false);
  });
});

describe("createBlocklistMatcher", () => {
  it("pre-compiles patterns and answers repeatedly", () => {
    const m = createBlocklistMatcher(["**/secret/**", "*.env"]);
    expect(m("secret/x.pem")).toBe(true);                   // **/ 可吸 0 段
    expect(m("/Users/me/.aws/secret/key.pem")).toBe(true);
    expect(m(".env")).toBe(true);
    expect(m("README.md")).toBe(false);
  });
});
