import { describe, expect, it, vi } from "vitest";
import type { CordisContext } from "@actspace/cordis-adapter";
import { DesktopAppService } from "../service.js";

function fixture(initialTitle: string | null = null) {
  let title = initialTitle;
  const events: { type: string; data: { title?: string } }[] = [];
  const append = vi.fn(async (event: typeof events[number]) => { events.push(event); if (event.type === "session/title-set") title = event.data.title ?? null; });
  const session = { append, appendMany: async (items: typeof events) => { for (const item of items) await append(item); }, flush: vi.fn(async () => undefined) };
  const snapshot = () => ({ metadata: { title }, sessionId: "session" });
  const run = vi.fn(async () => ({ sessionId: "session", snapshot: snapshot() }));
  const services = new Map<string, unknown>([
    ["session.runtime", { resume: async () => session, snapshot }],
    ["agent.runtime", { runs: { run } }], ["compaction.runtime", {}], ["llm.service", {}],
  ]);
  const app = new DesktopAppService({ get: (id: string) => services.get(id) } as CordisContext);
  let resolve!: (result: { text: string }) => void;
  let reject!: (error: Error) => void;
  const completion = new Promise<{ text: string }>((yes, no) => { resolve = yes; reject = no; });
  const complete = vi.spyOn(app, "completeText").mockImplementation(() => completion as ReturnType<typeof app.completeText>);
  return { app, run, complete, resolve, reject, snapshot, session, events };
}
const input = { sessionId: "session", content: "请帮我分析项目架构", model: "main-model" };

describe("first message session title", () => {
  it("generates once in the background and persists without awaiting the main reply", async () => {
    const f = fixture();
    await f.app.runTurn(input);
    expect(f.run).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledOnce());
    expect(f.complete).toHaveBeenCalledWith(expect.objectContaining({ purpose: "utility", model: "main-model" }));
    await f.app.runTurn({ ...input, content: "第二条" });
    expect(f.complete).toHaveBeenCalledOnce();
    f.resolve({ text: '"项目架构分析"' });
    await vi.waitFor(() => expect(f.snapshot().metadata.title).toBe("项目架构分析"));
    expect(f.session.flush).toHaveBeenCalled();
    await f.app.runTurn(input);
    expect(f.complete).toHaveBeenCalledOnce();
    await f.app.dispose();
  });

  it.each(["手动标题", "New chat"])("preserves an explicitly assigned title: %s", async title => {
    const f = fixture(title);
    await f.app.runTurn(input);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.snapshot().metadata.title).toBe(title);
    await f.app.dispose();
  });

  it("does not overwrite a manual rename while generation is pending", async () => {
    const f = fixture();
    await f.app.runTurn(input);
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledOnce());
    await f.app.updateSessionMetadata("session", { title: "我的标题" });
    f.resolve({ text: "模型标题" });
    await f.app.dispose();
    expect(f.snapshot().metadata.title).toBe("我的标题");
    expect(f.events.filter(event => event.type === "session/title-set")).toHaveLength(1);
  });

  it("does not replace a manual rename when the provider fails", async () => {
    const f = fixture();
    await f.app.runTurn(input);
    await f.app.updateSessionMetadata("session", { title: "保留手动标题" });
    f.reject(new Error("provider unavailable"));
    await f.app.dispose();
    expect(f.snapshot().metadata.title).toBe("保留手动标题");
  });

  it("extracts text from multimodal input without sending images to the title task", async () => {
    const f = fixture();
    await f.app.runTurn({ ...input, content: [{ type: "text", text: "解释架构图" }, { type: "image", artifactId: "private-image" }] });
    expect(f.complete).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.arrayContaining([{ role: "user", content: "解释架构图" }]) }));
    expect(JSON.stringify(f.complete.mock.calls)).not.toContain("private-image");
    f.resolve({ text: "架构图说明" });
    await vi.waitFor(() => expect(f.snapshot().metadata.title).toBe("架构图说明"));
    await f.app.dispose();
  });

  it("aborts outstanding generation on disposal without writing a late title", async () => {
    const f = fixture();
    await f.app.runTurn(input);
    const signal = f.complete.mock.calls[0]![0].signal!;
    const disposal = f.app.dispose();
    expect(signal.aborted).toBe(true);
    f.resolve({ text: "过期标题" });
    await disposal;
    expect(f.events).toHaveLength(0);
  });

  it("falls back when the utility request reaches its deadline", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.complete.mockImplementation(({ signal }) => new Promise((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    try {
      await f.app.runTurn(input);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(f.snapshot().metadata.title).toBe(input.content);
      await f.app.dispose();
    } finally { vi.useRealTimers(); }
  });

  it.each(["failure", "empty"])("falls back to the first message on %s", async kind => {
    const f = fixture();
    await f.app.runTurn(input);
    await vi.waitFor(() => expect(f.complete).toHaveBeenCalledOnce());
    if (kind === "failure") f.reject(new Error("provider unavailable"));
    else f.resolve({ text: "   " });
    await vi.waitFor(() => expect(f.snapshot().metadata.title).toBe(input.content));
    await f.app.dispose();
  });
});
