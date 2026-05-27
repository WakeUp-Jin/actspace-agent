import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fullBriefMarkdown, parseBriefFile } from "../parser";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kairos-brief-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeBrief(name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path, content, "utf8");
  return path;
}

describe("parseBriefFile", () => {
  it("parses well-formed frontmatter + body", async () => {
    const path = await writeBrief(
      "morning-summary.md",
      [
        "---",
        "id: morning-summary",
        "status: active",
        "trigger: interval",
        "intervalSec: 3600",
        "priority: high",
        "created: 2026-05-27T08:00:00.000Z",
        "lastRun: null",
        "nextRun: null",
        "---",
        "",
        "请每小时整理一次未读的 actspace 会话。",
      ].join("\n"),
    );
    const doc = await parseBriefFile(path);
    expect(doc.frontmatter.id).toBe("morning-summary");
    expect(doc.frontmatter.status).toBe("active");
    expect(doc.frontmatter.intervalSec).toBe(3600);
    expect(doc.frontmatter.priority).toBe("high");
    expect(doc.body).toContain("每小时");
  });

  it("throws when id mismatch", async () => {
    const path = await writeBrief("alpha.md", ["---", "id: beta", "---"].join("\n"));
    await expect(parseBriefFile(path)).rejects.toThrow(/does not match filename/);
  });

  it("falls back to defaults for missing optional fields", async () => {
    const path = await writeBrief("simple.md", ["---", "id: simple", "---", "", "body"].join("\n"));
    const doc = await parseBriefFile(path);
    expect(doc.frontmatter.status).toBe("active");
    expect(doc.frontmatter.priority).toBe("normal");
    expect(doc.frontmatter.intervalSec).toBeNull();
  });

  it("fullBriefMarkdown roundtrips", async () => {
    const path = await writeBrief(
      "demo.md",
      ["---", "id: demo", "status: active", "intervalSec: 60", "---", "", "BODY"].join("\n"),
    );
    const doc = await parseBriefFile(path);
    const text = fullBriefMarkdown(doc);
    expect(text).toContain("id: demo");
    expect(text).toContain("BODY");
  });
});
