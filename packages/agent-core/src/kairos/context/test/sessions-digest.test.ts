import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionsDigestBuilder } from "../sessions-digest";
import type { PathsConfig } from "../../config/schema";

let root: string;
let sessionsRoot: string;
let kairosRoot: string;
let builder: SessionsDigestBuilder;

async function writeSession(
  id: string,
  payloads: Array<{ type: string; turnId: string; payload?: unknown }>,
  meta?: Record<string, unknown>,
): Promise<void> {
  const dir = join(sessionsRoot, id);
  await mkdir(dir, { recursive: true });
  const jsonlPath = join(dir, "session.jsonl");
  const lines = payloads
    .map((p, i) => JSON.stringify({ id: `ev-${id}-${i}`, sessionId: id, timestamp: "2026-05-27T10:00:00.000Z", ...p }))
    .join("\n");
  await writeFile(jsonlPath, `${lines}\n`, "utf8");
  if (meta) await writeFile(join(dir, "meta.json"), JSON.stringify(meta), "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-sessions-"));
  sessionsRoot = join(root, "sessions-root");
  kairosRoot = join(root, "kairos");
  await mkdir(sessionsRoot, { recursive: true });
  const paths: PathsConfig = {
    tip: "test",
    paths: [{ path: sessionsRoot, watch: false }],
  };
  builder = new SessionsDigestBuilder({
    paths,
    stateFile: join(kairosRoot, "memory", "state.json"),
    outputFile: join(kairosRoot, "observe", "sessions-digest.json"),
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("SessionsDigestBuilder", () => {
  it("discovers 2 sessions and returns their digests", async () => {
    await writeSession(
      "s1",
      [{ type: "user_message", turnId: "t-1", payload: { content: "hi from s1" } }],
      { id: "s1", title: "First", updatedAt: "2026-05-27T10:00:00.000Z", turnCount: 1 },
    );
    await writeSession(
      "s2",
      [{ type: "user_message", turnId: "t-2", payload: { content: "hello s2" } }],
      { id: "s2", title: "Second", updatedAt: "2026-05-27T11:00:00.000Z", turnCount: 1 },
    );
    const res = await builder.refresh();
    expect(res.workspaces).toHaveLength(1);
    const sessions = res.workspaces[0].sessions;
    expect(sessions.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    const s1 = sessions.find((s) => s.id === "s1")!;
    expect(s1.lastUserPreview).toBe("hi from s1");
    expect(s1.title).toBe("First");
  });

  it("counts all turns as unread until cursor is committed", async () => {
    await writeSession("s1", [
      { type: "user_message", turnId: "t-1", payload: { content: "one" } },
      { type: "assistant_message", turnId: "t-1", payload: { content: "ok" } },
    ]);
    const first = await builder.refresh();
    expect(first.workspaces[0].sessions[0].unreadTurnsForKairos).toBe(1);

    // 计算/提交分离：未提交游标时再次 refresh，未读不变（失败 tick 不丢增量）
    const recompute = await builder.refresh();
    expect(recompute.workspaces[0].sessions[0].unreadTurnsForKairos).toBe(1);

    await builder.commitCursor(first.cursor);
    const second = await builder.refresh();
    expect(second.workspaces[0].sessions[0].unreadTurnsForKairos).toBe(0);
  });

  it("reports unread delta after new turn appended", async () => {
    await writeSession("s1", [
      { type: "user_message", turnId: "t-1", payload: { content: "one" } },
    ]);
    const first = await builder.refresh();
    await builder.commitCursor(first.cursor);        // tick 闭合：Kairos 已读 t-1
    // append a new turn
    const jsonlPath = join(sessionsRoot, "s1", "session.jsonl");
    const more = `\n${JSON.stringify({ id: "ev-extra", sessionId: "s1", turnId: "t-2", type: "user_message", payload: { content: "two" }, timestamp: "2026-05-27T12:00:00.000Z" })}\n`;
    const { appendFile } = await import("node:fs/promises");
    await appendFile(jsonlPath, more, "utf8");
    const second = await builder.refresh();
    expect(second.workspaces[0].sessions[0].unreadTurnsForKairos).toBe(1);
  });

  it("ignores subdir without session.jsonl", async () => {
    await mkdir(join(sessionsRoot, "not-a-session"), { recursive: true });
    await writeSession("s1", [{ type: "user_message", turnId: "t-1", payload: { content: "x" } }]);
    const res = await builder.refresh();
    expect(res.workspaces[0].sessions.map((s) => s.id)).toEqual(["s1"]);
  });
});
