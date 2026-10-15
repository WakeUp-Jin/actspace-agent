import { describe, expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { collectPresentedFiles, collectTurnChanges, parseUnifiedDiff } from "../components/turn-tail/turn-tail-data";

type DiffBlock = Extract<MessageBlock, { kind: "write_diff" | "edit_diff" }>;

function diffBlock(kind: DiffBlock["kind"], path: string, diff: string, additions: number, deletions: number, status: DiffBlock["status"] = "completed"): DiffBlock {
  return { kind, id: `${kind}-${path}-${additions}-${deletions}`, filePath: path.split("/").pop()!, outputPath: `/work/${path}`, outputRelativePath: path, additions, deletions, diff, createdAt: "now", status } as DiffBlock;
}

function deleteBlock(path: string): MessageBlock {
  return { kind: "delete", id: `delete-${path}`, filePath: path.split("/").pop()!, outputPath: `/work/${path}`, outputRelativePath: path, displayText: `Deleted ${path}`, createdAt: "now", status: "completed" };
}

function presentBlock(files: { path: string; description?: string }[], status: "completed" | "failed" = "completed"): MessageBlock {
  return {
    kind: "present",
    id: `present-${files.map((file) => file.path).join(",")}-${status}`,
    files: files.map((file) => ({ path: file.path, outputPath: `/work/${file.path}`, outputRelativePath: file.path, ...(file.description ? { description: file.description } : {}) })),
    displayText: "Presented",
    createdAt: "now",
    status,
  };
}

const editDiff = [
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -3,4 +3,4 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " ",
  " export { a, b };",
].join("\n");

describe("parseUnifiedDiff", () => {
  it("parses hunk headers and keeps file headers out of the lines", () => {
    expect(parseUnifiedDiff(editDiff)).toEqual([{
      oldStart: 3, oldLines: 4, newStart: 3, newLines: 4,
      lines: [" const a = 1;", "-const b = 2;", "+const b = 3;", " ", " export { a, b };"],
    }]);
  });

  it("treats content that looks like a file header inside a hunk as a deletion", () => {
    const hunks = parseUnifiedDiff("@@ -1,2 +1,1 @@\n--- a/old\n keep");
    expect(hunks[0].lines).toEqual(["--- a/old", " keep"]);
  });
});

describe("collectTurnChanges", () => {
  it("returns null when the turn changed nothing", () => {
    expect(collectTurnChanges([{ kind: "assistant", id: "a", content: "hi", createdAt: "now" }])).toBeNull();
  });

  it("strips the phantom empty line of a newly created file", () => {
    const created = diffBlock("write_diff", "notes.md", "--- a/notes.md\n+++ b/notes.md\n@@ -1,1 +1,2 @@\n-\n+# Notes\n+body", 2, 1);
    const changes = collectTurnChanges([created]);
    expect(changes).toMatchObject({ additions: 2, deletions: 0 });
    expect(changes?.files[0]).toMatchObject({ path: "notes.md", created: true, deleted: false });
    expect(changes?.files[0].hunks).toEqual([{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ["+# Notes", "+body"] }]);
  });

  it("recognises a created file whose content ends with a newline", () => {
    const created = diffBlock("write_diff", "a.txt", "--- a/a.txt\n+++ b/a.txt\n@@ -1,1 +1,2 @@\n+hello\n ", 1, 0);
    expect(collectTurnChanges([created])?.files[0]).toMatchObject({ created: true, hunks: [{ lines: ["+hello"] }] });
  });

  it("merges repeated edits of one file and keeps each hunk", () => {
    const changes = collectTurnChanges([
      diffBlock("edit_diff", "src/app.ts", editDiff, 1, 1),
      diffBlock("edit_diff", "src/app.ts", editDiff, 1, 1),
      diffBlock("edit_diff", "src/other.ts", editDiff, 1, 1, "failed"),
    ]);
    expect(changes?.files).toHaveLength(1);
    expect(changes).toMatchObject({ additions: 2, deletions: 2 });
    expect(changes?.files[0].hunks).toHaveLength(2);
  });

  it("drops a file created and deleted in the same turn but marks other deletes", () => {
    const changes = collectTurnChanges([
      diffBlock("write_diff", "tmp.txt", "--- a/tmp.txt\n+++ b/tmp.txt\n@@ -1,1 +1,1 @@\n-\n+x", 1, 1),
      deleteBlock("tmp.txt"),
      deleteBlock("old.txt"),
    ]);
    expect(changes?.files.map((file) => [file.path, file.deleted])).toEqual([["old.txt", true]]);
  });

  it("ignores changes outside the workspace", () => {
    const outside = { ...diffBlock("edit_diff", "x.ts", editDiff, 1, 1), outputRelativePath: "/abs/x.ts" };
    expect(collectTurnChanges([outside])).toBeNull();
  });
});

describe("collectPresentedFiles", () => {
  it("dedupes by path, keeps the first position and the latest description", () => {
    const files = collectPresentedFiles([
      presentBlock([{ path: "out/report.docx", description: "初稿" }, { path: "out/data.xlsx" }]),
      presentBlock([{ path: "out/skip.pdf" }], "failed"),
      presentBlock([{ path: "out/report.docx", description: "终稿" }]),
    ]);
    expect(files).toEqual([
      { path: "out/report.docx", absolutePath: "/work/out/report.docx", description: "终稿" },
      { path: "out/data.xlsx", absolutePath: "/work/out/data.xlsx" },
    ]);
  });
});

describe("legacy delete previews", () => {
  it("drops a file created this turn when an old delete preview carries only its basename", () => {
    const changes = collectTurnChanges([
      {
        kind: "write_diff", id: "w", filePath: "tmp-test-orders.mjs", outputPath: "/workspace/tmp-test-orders.mjs", outputRelativePath: "tmp-test-orders.mjs",
        additions: 1, deletions: 0, diff: "--- a/tmp-test-orders.mjs\n+++ b/tmp-test-orders.mjs\n@@ -1,1 +1,1 @@\n-\n+run()", collapsedLines: 0, status: "completed", createdAt: "2026-10-13T00:00:01.000Z",
      },
      { kind: "delete", id: "d", filePath: "tmp-test-orders.mjs", displayText: "Deleted tmp-test-orders.mjs", status: "completed", createdAt: "2026-10-13T00:00:02.000Z" },
    ]);
    expect(changes).toBeNull();
  });
});
