import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listVisualizations, visualizeReply } from "../visualize-service";
import type { AppDataRoots } from "../agent-turn";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoots(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-viz-"));
  created.push(dataRoot);
  const sessionRoot = join(dataRoot, "sessions");
  await mkdir(sessionRoot, { recursive: true });
  return {
    dataRoot,
    sessionRoot,
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: dataRoot,
    workspaceRoot: dataRoot,
  };
}

function sourceHashOf(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

describe("visualizeReply cache", () => {
  it("returns the cached HTML without invoking the model when the hash matches", async () => {
    const roots = await makeRoots();
    const sessionId = "session-viz";
    const messageId = "assistant-1";
    const content = "# 标题\n\n正文内容";
    const sourceHash = sourceHashOf(content);

    const sessionDir = join(roots.sessionRoot, sessionId);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      join(sessionDir, "visualizations.json"),
      JSON.stringify({
        [`${messageId}:${sourceHash}`]: {
          messageId,
          sourceHash,
          html: "<!doctype html><html><body>cached</body></html>",
          model: "deepseek-chat",
          provider: "deepseek",
          usage: { input: 10, output: 20, totalTokens: 30 },
          createdAt: new Date().toISOString(),
        },
      }),
      "utf8",
    );

    // 缓存命中：绝不触碰模型。若 convertReplyToHtml 被调用会因没有 apiKey/网络而抛错，
    // 该测试通过本身就证明走的是零模型调用的读缓存路径。
    const result = await visualizeReply({ sessionId, messageId, content }, roots);

    expect(result.cached).toBe(true);
    expect(result.html).toContain("cached");
    expect(result.sourceHash).toBe(sourceHash);
    expect(result.usage).toEqual({ input: 10, output: 20, totalTokens: 30 });
  });

  it("lists a session's visualizations newest-first with a title fallback", async () => {
    const roots = await makeRoots();
    const sessionId = "session-list";
    const sessionDir = join(roots.sessionRoot, sessionId);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      join(sessionDir, "visualizations.json"),
      JSON.stringify({
        "m1:h1": {
          messageId: "m1abcdef",
          sourceHash: "h1",
          title: "第一篇",
          html: "<html>1</html>",
          model: "x",
          provider: "y",
          usage: { input: 1, output: 1, totalTokens: 2 },
          createdAt: "2026-05-30T10:00:00.000Z",
        },
        "m2:h2": {
          messageId: "m2abcdef",
          sourceHash: "h2",
          html: "<html>2</html>",
          model: "x",
          provider: "y",
          usage: { input: 1, output: 1, totalTokens: 2 },
          createdAt: "2026-05-30T12:00:00.000Z",
        },
      }),
      "utf8",
    );

    const { items } = await listVisualizations({ sessionId }, roots);

    expect(items).toHaveLength(2);
    expect(items[0].messageId).toBe("m2abcdef");
    expect(items[0].title).toBe("可视化 m2abcdef");
    expect(items[1].title).toBe("第一篇");
  });

  it("returns an empty list when the session has no sidecar", async () => {
    const roots = await makeRoots();
    const { items } = await listVisualizations({ sessionId: "missing" }, roots);
    expect(items).toEqual([]);
  });
});
