import { describe, expect, it } from "vitest";
import { createSessionHeader, validateSessionHeader } from "../header.js";
import { createCoreCodecRegistry } from "../core-codecs.js";
import { createSessionForkSeed } from "../fork.js";

describe("optional durable worktree binding", () => {
  const registry = createCoreCodecRegistry();
  const base = { sessionId: "source", createdAt: "2026-10-07T00:00:00Z", cwd: "/worktree", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "2", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } };
  const worktree = { kind: "worktree" as const, sourceWorkspaceRoot: "/repo", workspaceRoot: "/worktree", baseBranch: "main", branch: "codex/test", baseCommit: "abc", createdAt: base.createdAt };
  it("reads old headers, validates the bound cwd, and carries the binding into forks", () => {
    expect(() => validateSessionHeader(createSessionHeader(base))).not.toThrow();
    const header = createSessionHeader({ ...base, worktree });
    expect(() => createSessionHeader({ ...base, cwd: "/different", worktree })).toThrow("Worktree must match");
    expect(() => createSessionHeader({ ...base, worktree: { ...worktree, createdAt: "bad" } })).toThrow("timestamp");
    const fork = createSessionForkSeed({ parentHeader: header, parentEvents: [], boundarySeq: -1, newSessionId: "fork", createdAt: base.createdAt, createdWith: base.createdWith, registry });
    expect(fork.header.worktree).toEqual(worktree);
    expect(fork.header.cwd).toBe(worktree.workspaceRoot);
  });
});
