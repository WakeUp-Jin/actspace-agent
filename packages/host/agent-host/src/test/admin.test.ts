import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostAdmin, requestHostAdmin } from "../admin.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it("keeps one Host writer and returns private management responses", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-admin-")); roots.push(root);
  const admin = new HostAdmin(root, async request => ({ state: "ready", command: request.command }));
  await admin.open(); admin.start();
  try {
    const second = new HostAdmin(root, async () => null);
    await expect(second.open()).rejects.toThrow();
    expect(await requestHostAdmin(root, "status")).toEqual({ state: "ready", command: "status" });
  } finally { await admin.close(); }
});
