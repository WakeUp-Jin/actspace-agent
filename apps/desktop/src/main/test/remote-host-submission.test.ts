import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PendingSubmissions } from "../remote-hosts/pending-submissions";
it("retains exact upload identities after acknowledgement loss and Main restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "remote-submission-"));
  const ref = { hostId: "host", sessionId: "same" };
  try {
    const store = new PendingSubmissions(root);
    await expect(store.withRecord(ref, "send", "content", async (record, save) => {
      record.uploadIds.push("upload"); record.ready = true; await save(); throw new Error("reply lost");
    })).rejects.toThrow("reply lost");
    await new PendingSubmissions(root).withRecord(ref, "send", "content", async record => { expect(record).toEqual({ content: "content", uploadIds: ["upload"], ready: true }); });
    await expect(store.withRecord(ref, "send", "changed", async () => {})).rejects.toThrow("different content");
    await store.withRecord({ ...ref, hostId: "other" }, "send", "changed", async record => { expect(record.ready).toBe(false); });
  } finally { await rm(root, { recursive: true, force: true }); }
});
