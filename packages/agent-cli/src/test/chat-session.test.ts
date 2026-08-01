import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { hostname } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireSessionLock } from "../chat-session";

describe("CLI session lock", () => {
  it("excludes concurrent owners and releases the lock", async () => {
    const root = await createSessionRoot("session-1");
    const first = await acquireSessionLock(root, "session-1");
    await expect(acquireSessionLock(root, "session-1")).rejects.toMatchObject({
      code: "SESSION_LOCKED",
    });
    await first.release();
    const second = await acquireSessionLock(root, "session-1");
    await second.release();
  });

  it("recovers only provably stale locks from the same host", async () => {
    const root = await createSessionRoot("session-1");
    const lockPath = join(root, "session-1", "cli.lock");
    await writeFile(lockPath, JSON.stringify({
      sessionId: "session-1",
      hostname: hostname(),
      pid: 999_999,
      createdAt: "2026-07-31T00:00:00.000Z",
    }));
    const recovered = await acquireSessionLock(root, "session-1", {
      isProcessAlive: () => false,
    });
    await recovered.release();

    await writeFile(lockPath, JSON.stringify({
      sessionId: "session-1",
      hostname: "another-host",
      pid: 999_999,
      createdAt: "2026-07-31T00:00:00.000Z",
    }));
    await expect(acquireSessionLock(root, "session-1", {
      isProcessAlive: () => false,
    })).rejects.toMatchObject({ code: "SESSION_LOCKED" });
  });
});

async function createSessionRoot(sessionId: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-cli-lock-"));
  await mkdir(join(root, sessionId), { recursive: true });
  return root;
}
