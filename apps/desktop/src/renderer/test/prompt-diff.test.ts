import { describe, expect, it } from "vitest";
import { promptDiffLines } from "../trajectory/prompt-diff";

const numbered = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`);

describe("promptDiffLines", () => {
  it("returns nothing for identical text", () => {
    expect(promptDiffLines("a\nb", "a\nb")).toEqual([]);
  });

  it("marks one replaced line with a header and 3 lines of context", () => {
    const before = numbered(10);
    const after = [...before];
    after[4] = "line five";
    expect(promptDiffLines(before.join("\n"), after.join("\n"))).toEqual([
      { kind: "meta", text: "@@ -2,7 +2,7 @@" },
      { kind: "context", text: " line 2" },
      { kind: "context", text: " line 3" },
      { kind: "context", text: " line 4" },
      { kind: "removed", text: "-line 5" },
      { kind: "added", text: "+line five" },
      { kind: "context", text: " line 6" },
      { kind: "context", text: " line 7" },
      { kind: "context", text: " line 8" },
    ]);
  });

  it("splits far-apart changes into hunks separated by a blank meta line", () => {
    const before = numbered(30);
    const after = before.filter(line => line !== "line 3");
    after.splice(after.length - 2, 0, "extra");
    const lines = promptDiffLines(before.join("\n"), after.join("\n"));
    const headers = lines.filter(line => line.kind === "meta" && line.text.startsWith("@@"));
    expect(headers).toHaveLength(2);
    expect(lines.filter(line => line.kind === "meta" && line.text === "")).toHaveLength(1);
    expect(lines.filter(line => line.kind === "removed").map(line => line.text)).toEqual(["-line 3"]);
    expect(lines.filter(line => line.kind === "added").map(line => line.text)).toEqual(["+extra"]);
  });

  it("handles appended lines and a fully replaced text", () => {
    expect(promptDiffLines("a", "a\nb").filter(line => line.kind === "added")).toEqual([{ kind: "added", text: "+b" }]);
    const replaced = promptDiffLines("x\ny", "p\nq");
    expect(replaced.filter(line => line.kind === "removed")).toHaveLength(2);
    expect(replaced.filter(line => line.kind === "added")).toHaveLength(2);
  });
});
