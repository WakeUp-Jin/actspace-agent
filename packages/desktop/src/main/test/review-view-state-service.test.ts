import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewViewStateService } from "../review-view-state-service";

describe("ReviewViewStateService", () => {
  it("persists viewed state without writing paths or source content", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-review-view-"));
    const filePath = join(root, "review-view-state.json");
    const identity = {
      workspaceId: "workspace-1",
      selection: { kind: "unstaged" } as const,
      path: "src/private-name.ts",
      fileFingerprint: "fingerprint-1",
    };
    await new ReviewViewStateService({ filePath }).setViewed(identity, true);

    expect(await new ReviewViewStateService({ filePath }).isViewed(identity)).toBe(true);
    const raw = await readFile(filePath, "utf8");
    expect(raw).not.toContain(identity.path);
    expect(raw).not.toContain(identity.fileFingerprint);
  });

  it("does not carry viewed state across file fingerprints", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-review-view-"));
    const service = new ReviewViewStateService({ filePath: join(root, "state.json") });
    const identity = {
      workspaceId: "workspace-1",
      selection: { kind: "branch", branch: "main" } as const,
      path: "src/index.ts",
      fileFingerprint: "before",
    };
    await service.setViewed(identity, true);

    expect(await service.isViewed({ ...identity, fileFingerprint: "after" })).toBe(false);
  });

  it("serializes concurrent writes and prunes oldest entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-review-view-"));
    let tick = 0;
    const service = new ReviewViewStateService({
      filePath: join(root, "state.json"),
      maxEntries: 2,
      now: () => new Date(Date.UTC(2026, 6, 30, 0, 0, tick++)),
    });
    const identity = (path: string) => ({
      workspaceId: "workspace-1",
      selection: { kind: "uncommitted" } as const,
      path,
      fileFingerprint: path,
    });

    await Promise.all([
      service.setViewed(identity("a.ts"), true),
      service.setViewed(identity("b.ts"), true),
      service.setViewed(identity("c.ts"), true),
    ]);

    expect(await service.isViewed(identity("a.ts"))).toBe(false);
    expect(await service.isViewed(identity("b.ts"))).toBe(true);
    expect(await service.isViewed(identity("c.ts"))).toBe(true);
  });
});
