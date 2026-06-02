import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendKairosInboxMessage,
  defaultKairosInboxContent,
  ensureKairosInboxScaffolding,
  getKairosInboxFilePath,
  loadKairosInboxSummary,
} from "../inbox";

async function makeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "kairos-inbox-test-"));
}

describe("Kairos inbox", () => {
  it("creates default inbox files without a Processed section", async () => {
    const root = await makeRoot();

    await ensureKairosInboxScaffolding(root);

    const main = await readFile(getKairosInboxFilePath(root, "main-agent"), "utf8");
    const lab = await readFile(getKairosInboxFilePath(root, "lab-agent"), "utf8");

    expect(main).toBe(defaultKairosInboxContent("main-agent"));
    expect(lab).toBe(defaultKairosInboxContent("lab-agent"));
    expect(main).toContain("## Pending");
    expect(main).not.toContain("Processed");
    expect(lab).not.toContain("Processed");

    const summary = await loadKairosInboxSummary({ kairosRoot: root });
    expect(summary.files.every((file) => file.truncated === false)).toBe(true);
    expect(summary.text).not.toContain("已按 V0 inbox 预算截断");
  });

  it("appends structured messages to the selected source file", async () => {
    const root = await makeRoot();
    const now = new Date("2026-06-02T03:50:00.000Z");

    await appendKairosInboxMessage({
      kairosRoot: root,
      source: "main-agent",
      priority: "high",
      topic: "前端验证 | 多次失败\n换行",
      body: "请 Kairos 后续观察这个重复失败。",
      relatedSessionId: "session_a",
      workspaceRoot: "/tmp/workspace",
      now,
    });
    await appendKairosInboxMessage({
      kairosRoot: root,
      source: "lab-agent",
      topic: "blocked 实验",
      body: "等待更多证据。",
      relatedExperimentId: "exp_1",
      now,
    });

    const main = await readFile(getKairosInboxFilePath(root, "main-agent"), "utf8");
    const lab = await readFile(getKairosInboxFilePath(root, "lab-agent"), "utf8");

    expect(main).toContain("### 2026-06-02T03:50:00.000Z | priority: high | topic: 前端验证 多次失败 换行");
    expect(main).toContain("- from: main-agent");
    expect(main).toContain("- relatedSessionId: session_a");
    expect(main).toContain("- workspaceRoot: /tmp/workspace");
    expect(main).toContain("请 Kairos 后续观察这个重复失败。");
    expect(lab).toContain("- from: lab-agent");
    expect(lab).toContain("- relatedExperimentId: exp_1");
  });

  it("loads missing files as warnings without throwing", async () => {
    const root = await makeRoot();

    const summary = await loadKairosInboxSummary({ kairosRoot: root });

    expect(summary.text).toContain("Agent 收件箱");
    expect(summary.files).toHaveLength(2);
    expect(summary.files.every((file) => file.missing)).toBe(true);
    expect(summary.warnings).toHaveLength(2);
  });

  it("keeps only recent message blocks and truncates long content", async () => {
    const root = await makeRoot();
    await ensureKairosInboxScaffolding(root);

    for (let i = 1; i <= 10; i++) {
      await appendKairosInboxMessage({
        kairosRoot: root,
        source: "main-agent",
        topic: `topic-${i}`,
        body: `body-${i} ${"x".repeat(120)}`,
        now: new Date(`2026-06-02T00:${String(i).padStart(2, "0")}:00.000Z`),
      });
    }

    const summary = await loadKairosInboxSummary({
      kairosRoot: root,
      maxMessagesPerFile: 3,
      maxCharsPerFile: 260,
      maxCombinedChars: 700,
    });

    const main = summary.files.find((file) => file.source === "main-agent");
    expect(main?.totalMessageCount).toBe(10);
    expect(main?.includedMessageCount).toBe(3);
    expect(main?.truncated).toBe(true);
    expect(summary.text).toContain("topic-10");
    expect(summary.text).not.toMatch(/\| topic: topic-1\n/);
    expect(summary.text).toContain("truncated");
  });

  it("treats malformed markdown as plain pending text", async () => {
    const root = await makeRoot();
    await ensureKairosInboxScaffolding(root);
    await writeFile(
      getKairosInboxFilePath(root, "main-agent"),
      "# Hand edited\n\n## Pending\n\nNo heading, but still useful.\n",
      "utf8",
    );

    const summary = await loadKairosInboxSummary({ kairosRoot: root });

    expect(summary.text).toContain("No heading, but still useful.");
    expect(summary.files.find((file) => file.source === "main-agent")?.totalMessageCount).toBe(0);
  });
});
