import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMeta, readMeta, updateMeta, incrementTurnCount } from "../meta";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let testDir: string;
let metaPath: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `actspace-test-meta-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
  metaPath = join(testDir, "meta.json");
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("meta.json operations", () => {
  it("should create and read meta", async () => {
    const result = await createMeta(metaPath, "session-1", "Test Session");
    expect(result.ok).toBe(true);

    const meta = await readMeta(metaPath);
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe("session-1");
    expect(meta!.title).toBe("Test Session");
    expect(meta!.turnCount).toBe(0);
    expect(meta!.createdAt).toBeDefined();
    expect(meta!.updatedAt).toBeDefined();
  });

  it("should return null for non-existent meta", async () => {
    const meta = await readMeta(join(testDir, "nope.json"));
    expect(meta).toBeNull();
  });

  it("should update specific fields", async () => {
    await createMeta(metaPath, "session-1");

    const result = await updateMeta(metaPath, { title: "Updated Title", turnCount: 5 });
    expect(result.ok).toBe(true);

    const meta = await readMeta(metaPath);
    expect(meta!.title).toBe("Updated Title");
    expect(meta!.turnCount).toBe(5);
    expect(meta!.id).toBe("session-1");
  });

  it("should return error when updating non-existent meta", async () => {
    const result = await updateMeta(join(testDir, "nope.json"), { title: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should increment turn count", async () => {
    await createMeta(metaPath, "session-1");

    await incrementTurnCount(metaPath, "deepseek-v3");
    let meta = await readMeta(metaPath);
    expect(meta!.turnCount).toBe(1);

    await incrementTurnCount(metaPath);
    meta = await readMeta(metaPath);
    expect(meta!.turnCount).toBe(2);
  });

  it("should preserve existing fields during increment", async () => {
    await createMeta(metaPath, "session-1", "My Session");
    const original = await readMeta(metaPath);

    await incrementTurnCount(metaPath);
    const updated = await readMeta(metaPath);

    expect(updated!.id).toBe(original!.id);
    expect(updated!.title).toBe(original!.title);
    expect(updated!.createdAt).toBe(original!.createdAt);
    expect(updated!.turnCount).toBe(original!.turnCount + 1);
  });

  it("should persist workspaceRoot when provided at creation", async () => {
    const workspaceRoot = "/Users/test/projects/actspace-agent";
    await createMeta(metaPath, "session-1", "Workspace-aware", { workspaceRoot });

    const meta = await readMeta(metaPath);
    expect(meta!.workspaceRoot).toBe(workspaceRoot);
    expect(meta!.pinned).toBe(false);
  });

  it("should update pinned and workspaceRoot via updateMeta", async () => {
    await createMeta(metaPath, "session-1");

    const result = await updateMeta(metaPath, { pinned: true, workspaceRoot: "/tmp/ws" });
    expect(result.ok).toBe(true);

    const meta = await readMeta(metaPath);
    expect(meta!.pinned).toBe(true);
    expect(meta!.workspaceRoot).toBe("/tmp/ws");
  });

  it("round-trips and clears worktree metadata", async () => {
    const worktree = {
      kind: "worktree" as const,
      sourceWorkspaceRoot: "/tmp/source",
      workspaceRoot: "/tmp/worktree",
      baseBranch: "main",
      branch: "actspace/92803054",
      baseCommit: "a1b2c3d4",
      createdAt: "2026-07-29T00:00:00.000Z",
    };
    await createMeta(metaPath, "session-1", "Worktree", { worktree });

    expect((await readMeta(metaPath))?.worktree).toEqual(worktree);

    const result = await updateMeta(metaPath, { worktree: null });
    expect(result.ok).toBe(true);
    expect((await readMeta(metaPath))?.worktree).toBeUndefined();
  });

});
