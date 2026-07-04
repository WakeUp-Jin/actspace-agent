import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KairosNotificationStore } from "../notification-store";

describe("KairosNotificationStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kairos-notif-"));
    filePath = join(dir, "notifications.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("adds notifications, lists newest-first, and persists to disk", async () => {
    const store = new KairosNotificationStore(filePath);
    await store.load();
    await store.add({ title: "first", body: null, level: "info" });
    await store.add({ title: "second", body: "details", level: "important" });

    const list = store.list();
    expect(list.map((n) => n.title)).toEqual(["second", "first"]);
    expect(store.unreadCount()).toBe(2);

    const raw = JSON.parse(await readFile(filePath, "utf8"));
    expect(raw.entries).toHaveLength(2);

    // 新实例从盘上恢复
    const store2 = new KairosNotificationStore(filePath);
    await store2.load();
    expect(store2.unreadCount()).toBe(2);
    expect(store2.list()[0].title).toBe("second");
  });

  it("marks a single notification read, ignores unknown id", async () => {
    const store = new KairosNotificationStore(filePath);
    await store.load();
    const a = await store.add({ title: "a", body: null, level: "info" });
    await store.add({ title: "b", body: null, level: "info" });

    expect(await store.markRead(a.id)).toBe(1);
    expect(store.list().find((n) => n.id === a.id)?.read).toBe(true);
    expect(await store.markRead("nonexistent")).toBe(1);
  });

  it("marks all read when id omitted", async () => {
    const store = new KairosNotificationStore(filePath);
    await store.load();
    await store.add({ title: "a", body: null, level: "info" });
    await store.add({ title: "b", body: null, level: "info" });

    expect(await store.markRead()).toBe(0);
    expect(store.list().every((n) => n.read)).toBe(true);
  });

  it("evicts oldest read entries first when over capacity", async () => {
    const store = new KairosNotificationStore(filePath);
    await store.load();
    for (let i = 0; i < 200; i++) {
      await store.add({ title: `n${i}`, body: null, level: "info" });
    }
    // n0 已读 → 超限时它先被淘汰
    const oldest = store.list()[199];
    expect(oldest.title).toBe("n0");
    await store.markRead(oldest.id);

    await store.add({ title: "n200", body: null, level: "info" });
    const titles = store.list().map((n) => n.title);
    expect(titles).toHaveLength(200);
    expect(titles).not.toContain("n0");
    expect(titles[0]).toBe("n200");
  });

  it("recovers from corrupted file with empty table", async () => {
    await writeFile(filePath, "{not json", "utf8");
    const store = new KairosNotificationStore(filePath);
    await store.load();
    expect(store.list()).toEqual([]);
    await store.add({ title: "fresh", body: null, level: "info" });
    expect(store.unreadCount()).toBe(1);
  });

  it("removes a single notification by id, ignores unknown id", async () => {
    const store = new KairosNotificationStore(filePath);
    await store.load();
    const a = await store.add({ title: "a", body: null, level: "info" });
    await store.add({ title: "b", body: null, level: "info" });

    expect(await store.remove({ id: a.id })).toBe(1);
    expect(store.list().map((n) => n.title)).toEqual(["b"]);
    expect(store.unreadCount()).toBe(1);
    expect(await store.remove({ id: "nonexistent" })).toBe(0);

    // 删除落盘：新实例恢复后仍然只剩 b
    const store2 = new KairosNotificationStore(filePath);
    await store2.load();
    expect(store2.list().map((n) => n.title)).toEqual(["b"]);
  });

  it("removes read entries with scope=read and everything with scope=all", async () => {
    const store = new KairosNotificationStore(filePath);
    await store.load();
    const a = await store.add({ title: "a", body: null, level: "info" });
    await store.add({ title: "b", body: null, level: "info" });
    await store.add({ title: "c", body: null, level: "info" });
    await store.markRead(a.id);

    expect(await store.remove({ scope: "read" })).toBe(1);
    expect(store.list().map((n) => n.title)).toEqual(["c", "b"]);

    expect(await store.remove({ scope: "all" })).toBe(2);
    expect(store.list()).toEqual([]);
    expect(store.unreadCount()).toBe(0);
  });

  it("fires onCreated listeners with the new notification", async () => {
    const store = new KairosNotificationStore(filePath);
    await store.load();
    const seen: string[] = [];
    store.onCreated((n) => seen.push(n.title));
    await store.add({ title: "hello", body: null, level: "info" });
    expect(seen).toEqual(["hello"]);
  });
});
