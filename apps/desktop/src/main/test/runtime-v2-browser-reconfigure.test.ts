// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
const { bootDesktopRuntimeV2 } = vi.hoisted(() => ({ bootDesktopRuntimeV2: vi.fn() }));
vi.mock("../runtime-v2/desktop-host-adapter", () => ({ bootDesktopRuntimeV2 }));
import { DesktopRuntimeV2Registry, type DesktopRuntimeV2RegistryOptions } from "../runtime-v2/runtime-registry";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Browser Runtime restart admission", () => {
  const rootsToRemove: string[] = [];
  const registries: DesktopRuntimeV2Registry[] = [];
  afterEach(async () => {
    await Promise.all(registries.splice(0).map((registry) => registry.dispose()));
    await Promise.all(rootsToRemove.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    vi.clearAllMocks();
  });

  async function setup() {
    const dataRoot = await mkdtemp("/tmp/actspace-reconfigure-");
    rootsToRemove.push(dataRoot);
    let bridgeReady = false;
    const browser = { socketPath: "/tmp/test-browser.sock", getStatus: vi.fn(async () => ({ runState: "ready", bridgeReady })), setRuntimeReady: vi.fn() };
    const app = {
      listSessions: vi.fn(async () => []),
      subscribeSessionProjection: vi.fn(() => vi.fn()),
      isIdleForReconfigure: vi.fn(async () => true),
      enqueueMainMessage: vi.fn(async () => ({ messageId: "message" })),
      inspectSession: vi.fn(async () => ({ sessionId: "session", throughJournalSeq: 1 })),
      resumeMainSession: vi.fn(async () => ({ sessionId: "session", throughJournalSeq: 1 })),
    };
    const learning = { getState: vi.fn(() => ({ enabled: true, targetSessionId: "session" })), subscribe: vi.fn(() => vi.fn()), dispose: vi.fn(async () => {}), enableSession: vi.fn(async () => {}) };
    const shutdown = vi.fn(async () => {});
    bootDesktopRuntimeV2.mockImplementation(async () => ({ browserReady: bridgeReady, profile: {
      context: { get: (name: string) => name === "desktop.app" ? app : name === "english-learning" ? learning : name === "tools.browser" ? { available: bridgeReady, registrations: [1], definitions: [1] } : undefined },
      getState: () => ({ state: "ready", runtimeInstanceId: "test" }), shutdown,
    } }));
    const registry = new DesktopRuntimeV2Registry({ roots: { dataRoot, workspaceRoot: join(dataRoot, "workspace"), defaultWorkspaceRoot: join(dataRoot, "workspace") }, browser, loadModule: async () => ({}) } as unknown as DesktopRuntimeV2RegistryOptions);
    registries.push(registry);
    await registry.boot();
    return { registry, app, browser, learning, shutdown, connect: () => { bridgeReady = true; } };
  }

  it("waits for background activity and accepted Inbox writes before disposing", async () => {
    const fixture = await setup();
    fixture.connect();
    fixture.app.isIdleForReconfigure.mockResolvedValue(false);
    expect(await fixture.registry.refreshBrowser()).toBe(false);
    expect(fixture.shutdown).not.toHaveBeenCalled();
    fixture.app.isIdleForReconfigure.mockResolvedValue(true);
    const accepted = deferred<{ messageId: string }>();
    fixture.app.enqueueMainMessage.mockReturnValueOnce(accepted.promise);
    const pending = fixture.registry.enqueueMessage({ sessionId: "session", content: "hello" } as never);
    expect(await fixture.registry.refreshBrowser()).toBe(false);
    expect(fixture.shutdown).not.toHaveBeenCalled();
    accepted.resolve({ messageId: "message" });
    await pending;
    expect(await fixture.registry.refreshBrowser()).toBe(true);
    expect(fixture.shutdown).toHaveBeenCalledOnce();
  });

  it("closes admission during shutdown and restores subscriptions and learning target after boot", async () => {
    const fixture = await setup();
    const entered = deferred<void>();
    const release = deferred<void>();
    fixture.shutdown.mockImplementationOnce(async () => { entered.resolve(); await release.promise; });
    fixture.registry.subscribeEnglishLearning(() => {});
    fixture.connect();
    const switching = fixture.registry.refreshBrowser();
    await entered.promise;
    await expect(fixture.registry.enqueueMessage({ sessionId: "session", content: "blocked" } as never)).rejects.toThrow("reconnecting Chrome");
    expect(fixture.app.enqueueMainMessage).not.toHaveBeenCalled();
    expect(bootDesktopRuntimeV2).toHaveBeenCalledTimes(1);
    release.resolve();
    expect(await switching).toBe(true);
    expect(bootDesktopRuntimeV2).toHaveBeenCalledTimes(2);
    expect(fixture.learning.enableSession).toHaveBeenCalledWith("session");
    expect(fixture.learning.subscribe).toHaveBeenCalledTimes(2);
    expect(fixture.browser.setRuntimeReady).toHaveBeenLastCalledWith(true);
    await fixture.registry.enqueueMessage({ sessionId: "session", content: "accepted" } as never);
    expect(fixture.app.enqueueMainMessage).toHaveBeenCalledOnce();
  });
});
