import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KairosNotificationStore } from "../../storage/notification-store";
import { createNotifyUserExecutor, notifyUserDefinition, NOTIFY_PER_TICK_LIMIT } from "../notify";
import type { ToolExecutorFn } from "../../../tools/types";

describe("notify_user tool", () => {
  let dir: string;
  let store: KairosNotificationStore;
  let tickCount: number;
  let executor: ToolExecutorFn;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kairos-notify-"));
    store = new KairosNotificationStore(join(dir, "notifications.json"));
    await store.load();
    tickCount = 0;
    executor = createNotifyUserExecutor({
      store,
      getTickNotifyCount: () => tickCount,
      incTickNotifyCount: () => {
        tickCount += 1;
      },
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("declares no path access", () => {
    expect(notifyUserDefinition.extractPaths!({ title: "x" })).toEqual([]);
  });

  it("creates a notification with defaults (level=info, body=null)", async () => {
    const res = await executor({ title: "CSV analyzed" }, "/");
    expect(res.success).toBe(true);
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "CSV analyzed", body: null, level: "info", read: false });
  });

  it("preserves body and important level", async () => {
    await executor({ title: "t", body: "  details  ", level: "important" }, "/");
    expect(store.list()[0]).toMatchObject({ body: "details", level: "important" });
  });

  it("rejects empty title and invalid level", async () => {
    expect(await executor({ title: "  " }, "/")).toMatchObject({ success: false });
    expect(await executor({}, "/")).toMatchObject({ success: false });
    expect(await executor({ title: "t", level: "urgent" }, "/")).toMatchObject({ success: false });
    expect(store.list()).toHaveLength(0);
  });

  it("enforces per-tick limit and suggests merging", async () => {
    for (let i = 0; i < NOTIFY_PER_TICK_LIMIT; i++) {
      expect((await executor({ title: `n${i}` }, "/")).success).toBe(true);
    }
    const blocked = await executor({ title: "one too many" }, "/");
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain("Merge");
    expect(store.list()).toHaveLength(NOTIFY_PER_TICK_LIMIT);

    // controller 每 tick 清零后可以继续发
    tickCount = 0;
    expect((await executor({ title: "next tick" }, "/")).success).toBe(true);
  });
});
