import { describe, expect, it, vi } from "vitest";
import { readSseData } from "../sse.js";
import { fixture, streamOf } from "./helpers.js";

async function collect(pieces: readonly string[]) {
  const onData = vi.fn();
  const out: string[] = [];
  for await (const data of readSseData(streamOf(pieces), onData)) out.push(data);
  return { out, onData };
}

describe("readSseData", () => {
  it("yields each event's data, including [DONE]", async () => {
    const { out, onData } = await collect(['data: {"a":1}\n\n', 'data: {"b":2}\n\ndata: [DONE]\n\n']);
    expect(out).toEqual(['{"a":1}', '{"b":2}', "[DONE]"]);
    expect(onData).toHaveBeenCalledTimes(3);
  });

  it("joins half lines split across chunks, including split multi-byte characters", async () => {
    const bytes = new TextEncoder().encode('data: {"t":"深度"}\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 13)); // cuts inside the first Chinese character
        controller.enqueue(bytes.slice(13));
        controller.close();
      },
    });
    const out: string[] = [];
    for await (const data of readSseData(stream, () => {})) out.push(data);
    expect(out).toEqual(['{"t":"深度"}']);
    expect((await collect(["da", 'ta: {"x"', ":1}\n", "\n"])).out).toEqual(['{"x":1}']);
  });

  it("accepts \\r\\n line endings and multi-line data", async () => {
    const { out } = await collect(["data: line1\r\ndata: line2\r\n\r\ndata:x\r\n\r\n"]);
    expect(out).toEqual(["line1\nline2", "x"]);
  });

  it("drops comment lines without counting them as data", async () => {
    const { out, onData } = await collect([": keep-alive\n\n", ": keep-alive\n\n", "data: 1\n\n"]);
    expect(out).toEqual(["1"]);
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it("flushes a final event that has no trailing blank line", async () => {
    expect((await collect(["data: last"])).out).toEqual(["last"]);
  });

  it("replays a recorded DeepSeek stream", async () => {
    const out: string[] = [];
    for await (const data of readSseData(streamOf([fixture("search-and-read")]), () => {})) out.push(data);
    expect(out.at(-1)).toBe("[DONE]");
    expect(out.slice(0, -1).every(data => typeof JSON.parse(data) === "object")).toBe(true);
  });

  it("cancels the body when the consumer stops early", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode("data: 1\n\n")); },
      cancel,
    });
    for await (const _ of readSseData(stream, () => {})) break;
    expect(cancel).toHaveBeenCalled();
    expect(stream.locked).toBe(false);
  });

  it("cancels the body and throws when the signal aborts mid-read", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start() { /* never sends */ }, cancel });
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("stop")), 10);
    await expect((async () => { for await (const _ of readSseData(stream, () => {}, controller.signal)) { /* none */ } })()).rejects.toThrow("stop");
    expect(cancel).toHaveBeenCalled();
    expect(stream.locked).toBe(false);
  });
});
