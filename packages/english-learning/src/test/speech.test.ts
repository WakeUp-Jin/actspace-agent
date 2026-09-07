import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SPEECH_SETTINGS, SPEECH_MODELS } from "@actspace/shared";
import { extractEnglish, splitEnglish } from "../english-text.js";
import { SpeechQueue } from "../queue.js";
import { synthesizeEnglish } from "../minimax.js";
import type { SpeechHostPort } from "../host-port.js";
import { completedMessage } from "../completion.js";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

describe("English text", () => {
  it("keeps English paragraphs while excluding Chinese, fences, code, paths, and URLs", () => {
    const text = '# Ready\n准备好\n\nThe `server` is [ready](https://example.com).\n服务已准备好\n```ts\nconsole.log("Do not read");\n```\n~~~\nDo not read either\n~~~\n    Indented code\n/Users/example/file.ts\nhttps://example.com\nEnglish 混合中文\n![Photo](photo.png)';
    expect(extractEnglish(text)).toEqual(["Ready", "The is ready."]);
  });
  it("handles empty English and bounds Unicode segments", () => {
    expect(extractEnglish("只有中文\n1234")).toEqual([]);
    const segments = splitEnglish(("A useful sentence. ").repeat(200));
    expect(segments.every((text) => [...text].length <= 1_000)).toBe(true);
    expect(segments.join(" ")).toBe(("A useful sentence. ").repeat(200).trim());
  });
});

describe("speech queue", () => {
  it("waits for a concurrent stop before starting new synthesis", async () => {
    let release!: () => void;
    const host: SpeechHostPort = { supported: true, settings: () => ({ ...DEFAULT_SPEECH_SETTINGS }), resolveCredential: () => "key", play: vi.fn(async () => {}), stop: vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined), subscribeSettings: () => () => {} };
    const synthesize = vi.fn(async () => new Uint8Array([1]));
    const queue = new SpeechQueue(host, vi.fn(), synthesize);
    queue.enqueue(["Old response."]);
    const stopped = queue.stop();
    queue.enqueue(["New response."]);
    await vi.waitFor(() => expect(host.stop).toHaveBeenCalledOnce());
    expect(synthesize).not.toHaveBeenCalled();
    release(); await stopped;
    await vi.waitFor(() => expect(host.play).toHaveBeenCalledOnce());
    expect(synthesize).toHaveBeenCalledWith("New response.", expect.anything(), "key", expect.any(AbortSignal));
    await queue.dispose();
  });

  it("never plays a synthesis result that arrives after stop, and accepts new work", async () => {
    let finish!: (audio: Uint8Array) => void;
    const host: SpeechHostPort = { supported: true, settings: () => ({ ...DEFAULT_SPEECH_SETTINGS }), resolveCredential: () => "canary", play: vi.fn(async () => {}), stop: vi.fn(async () => {}), subscribeSettings: () => () => {} };
    const synthesize = vi.fn().mockImplementationOnce(() => new Promise<Uint8Array>((resolve) => { finish = resolve; })).mockResolvedValue(new Uint8Array([1]));
    const changes = vi.fn(); const queue = new SpeechQueue(host, changes, synthesize);
    queue.enqueue(["Old response."]);
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1));
    await queue.stop(); queue.enqueue(["New response."]);
    finish(new Uint8Array([2]));
    await vi.waitFor(() => expect(host.play).toHaveBeenCalledTimes(1));
    expect(host.play).toHaveBeenCalledWith(new Uint8Array([1]), expect.any(AbortSignal));
    await queue.dispose();
  });
  it("rejects an oversized answer atomically and reports missing credentials without synthesis", async () => {
    const host: SpeechHostPort = { supported: true, settings: () => ({ ...DEFAULT_SPEECH_SETTINGS }), resolveCredential: () => "key", play: vi.fn(), stop: vi.fn(async () => {}), subscribeSettings: () => () => {} };
    const synthesize = vi.fn(); const changed = vi.fn(); const queue = new SpeechQueue(host, changed, synthesize);
    queue.enqueue(Array(21).fill("English."));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ notice: expect.stringContaining("已满") }));
    host.resolveCredential = () => undefined;
    queue.enqueue(["English."]);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ speechStatus: "unconfigured" }));
    expect(synthesize).not.toHaveBeenCalled(); await queue.dispose();
  });
});

describe("MiniMax", () => {
  it.each(SPEECH_MODELS)("sends selected model %s and decodes valid hex", async (model) => {
    const request = vi.fn(async () => new Response(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: "0102" } }))) as unknown as typeof fetch;
    expect(await synthesizeEnglish("Hello.", { ...DEFAULT_SPEECH_SETTINGS, model }, "secret-canary", new AbortController().signal, request)).toEqual(Buffer.from([1, 2]));
    expect(request).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.stringContaining(`"model":"${model}"`) }));
    expect(request).toHaveBeenCalledWith(expect.stringContaining("api.minimaxi.com"), expect.objectContaining({ body: expect.stringContaining('"stream":false') }));
  });
  it.each([
    [{ base_resp: { status_code: 1008, status_msg: "secret-canary" } }, "minimax_1008"],
    [{ data: { audio: "invalid-secret-canary" } }, "invalid_audio"],
  ])("redacts provider errors and rejects bad audio", async (body, code) => {
    const request = vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    await expect(synthesizeEnglish("Hello.", { ...DEFAULT_SPEECH_SETTINGS }, "secret-canary", new AbortController().signal, request)).rejects.toMatchObject({ code });
    try { await synthesizeEnglish("Hello.", { ...DEFAULT_SPEECH_SETTINGS }, "secret-canary", new AbortController().signal, request); } catch (error) { expect(String(error)).not.toContain("secret-canary"); }
  });
});

it("selects only the terminal turn's last assistant text blocks", () => {
  const event = (seq: number, type: string, data: unknown) => ({ seq, type, data }) as SessionEventEnvelopeV1;
  const message = event(2, "assistant/message", { turnId: "t", stepId: "s", messageId: "m", finishReason: "stop", content: [{ type: "reasoning", text: "private" }, { type: "text", text: "Hello.\n你好" }] });
  const end = event(3, "turn/end", { turnId: "t", reason: "completed" });
  expect(completedMessage([message, end], end)).toEqual({ messageId: "m", stepId: "s", text: "Hello.\n你好" });
  expect(completedMessage([message], event(3, "turn/end", { turnId: "t", reason: "failed" }))).toBeNull();
});
