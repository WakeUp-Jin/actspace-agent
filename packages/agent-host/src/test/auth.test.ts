import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostAuth } from "../auth.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(now?: () => number) { const root = await mkdtemp(join(tmpdir(), "host-auth-")); roots.push(root); const auth = new HostAuth(root, now); await auth.open(); return { root, auth }; }
it("atomically consumes one code, persists hashes and revokes one device after restart", async () => {
  const { auth, root } = await fixture();
  const { code } = await auth.createPairCode();
  const results = await Promise.allSettled([auth.pair(code, "Mac", "one"), auth.pair(code, "Phone", "two")]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const first = results.find(r => r.status === "fulfilled")! as PromiseFulfilledResult<Awaited<ReturnType<HostAuth["pair"]>>>;
  const second = await auth.pair((await auth.createPairCode()).code, "Other", "three");
  const stored = await readFile(join(root, "devices.json"), "utf8");
  expect(stored).not.toContain(first.value.token); expect(stored).not.toContain(code);
  const restored = new HostAuth(root); await restored.open(); expect(restored.hostId).toBe(auth.hostId);
  expect(restored.authenticate(first.value.token)).toBe(first.value.deviceId);
  await restored.revoke(first.value.deviceId);
  expect(() => restored.authenticate(first.value.token)).toThrow(/revoked/);
  expect(restored.authenticate(second.token)).toBe(second.deviceId);
  expect(JSON.stringify(restored.list())).not.toContain("tokenHash");
});
it("rejects expired codes and rate limits sources", async () => {
  let now = 0; const { auth } = await fixture(() => now); const { code } = await auth.createPairCode(); now = 600_000;
  for (let i = 0; i < 5; i++) await expect(auth.pair(code, "Mac", "same")).rejects.toThrow(/expired/);
  await expect(auth.pair(code, "Mac", "same")).rejects.toThrow(/rate limit/);
});
