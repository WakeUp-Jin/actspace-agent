// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
const { bootDesktopRuntimeV2 } = vi.hoisted(() => ({ bootDesktopRuntimeV2: vi.fn() }));
vi.mock("../runtime-v2/desktop-host-adapter", () => ({ bootDesktopRuntimeV2 }));
import { DesktopArtifactStore } from "../runtime-v2/artifact-store";
import { DesktopRuntimeV2Registry, type DesktopRuntimeV2RegistryOptions } from "../runtime-v2/runtime-registry";

const fixtures: Array<{ root: string; registry: DesktopRuntimeV2Registry }> = [];
afterEach(async () => {
  for (const { root, registry } of fixtures.splice(0)) {
    await registry.dispose();
    await rm(root, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "actspace-historical-artifacts-"));
  const store = new DesktopArtifactStore(root);
  const ref = await store.create({ bytes: Buffer.from("owned image"), mediaType: "image/png", owner: { sessionId: "session", callId: "attachment", pluginId: "desktop", name: "user-attachment" } });
  const content = [{ type: "artifact", artifact: { artifactId: ref.artifactId, mediaType: ref.mediaType } }];
  const journal = [{ type: "user/message", surface: { kind: "append", node: { kind: "user", messageId: "original", content } } }];
  const snapshot = { messages: [{ kind: "user", content: { text: "compacted summary" } }], tools: [] };
  const app = {
    inspectSession: vi.fn(async () => snapshot),
    inspectSessionEvents: vi.fn(async () => journal),
    listSessions: vi.fn(async () => []),
    subscribeSessionProjection: () => () => {},
  };
  bootDesktopRuntimeV2.mockResolvedValue({ artifacts: store, browserReady: false, profile: {
    context: { get: (name: string) => name === "desktop.app" ? app : undefined },
    getState: () => ({ runtimeInstanceId: "test" }), shutdown: vi.fn(),
  } });
  const registry = new DesktopRuntimeV2Registry({ roots: { dataRoot: root, workspaceRoot: root, defaultWorkspaceRoot: root }, loadModule: async () => ({}) } as unknown as DesktopRuntimeV2RegistryOptions);
  fixtures.push({ root, registry });
  await registry.boot();
  return { root, store, ref, content, journal, snapshot, app, registry };
}

describe("Desktop historical artifact authorization", () => {
  it("reads a durable input image after compaction removes it from the active surface", async () => {
    const f = await fixture();
    const before = await readFile(join(f.store.root, f.ref.artifactId));
    const result = await f.registry.resolveArtifact("session", f.ref.artifactId);
    expect(Buffer.from(result.bytes)).toEqual(before);
    expect(result.mediaType).toBe("image/png");
    expect(f.app.inspectSessionEvents).toHaveBeenCalledExactlyOnceWith("session");
  });

  it("keeps current references on the snapshot fast path", async () => {
    const f = await fixture();
    f.snapshot.messages = [{ kind: "user", content: f.content }] as unknown as typeof f.snapshot.messages;
    await expect(f.registry.resolveArtifact("session", f.ref.artifactId)).resolves.toMatchObject({ mediaType: "image/png" });
    expect(f.app.inspectSessionEvents).not.toHaveBeenCalled();
  });

  it("rejects an unreferenced staged image and an ID mentioned only in text", async () => {
    const f = await fixture();
    f.journal[0].surface.node.content = [{ type: "text", text: f.ref.artifactId }] as unknown as typeof f.content;
    await expect(f.registry.resolveArtifact("session", f.ref.artifactId)).rejects.toThrow("not referenced");
    f.journal.length = 0;
    await expect(f.registry.resolveArtifact("session", f.ref.artifactId)).rejects.toThrow("not referenced");
  });

  it("still rejects another Session's image even if its ID is referenced", async () => {
    const f = await fixture();
    await expect(f.registry.resolveArtifact("other", f.ref.artifactId)).rejects.toThrow("does not belong");
  });

  it("still checks the historical reference's media type", async () => {
    const f = await fixture();
    f.content[0].artifact.mediaType = "image/jpeg";
    await expect(f.registry.resolveArtifact("session", f.ref.artifactId)).rejects.toThrow("media type does not match");
  });

  it("still verifies bytes before returning a historical image", async () => {
    const f = await fixture();
    await writeFile(join(f.store.root, f.ref.artifactId), "tampered");
    await expect(f.registry.resolveArtifact("session", f.ref.artifactId)).rejects.toThrow("integrity check failed");
  });

  it("rolls back only unsubmitted images and preserves compacted durable attachments", async () => {
    const f = await fixture();
    const staged = await f.store.create({ bytes: Buffer.from("unsubmitted"), mediaType: "image/png", owner: { sessionId: "session", callId: "staged", pluginId: "desktop", name: "user-attachment" } });
    await f.registry.rollbackImportedAttachments("session", [f.ref.artifactId, staged.artifactId]);
    await expect(f.store.readForSession("session", f.ref.artifactId)).resolves.toMatchObject({ mediaType: "image/png" });
    await expect(f.store.readForSession("session", staged.artifactId)).rejects.toThrow();
  });
});
