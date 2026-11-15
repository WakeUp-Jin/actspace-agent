/** One SSE event larger than this is treated as a broken stream rather than buffered without bound. */
const MAX_EVENT_CHARS = 8 * 1024 * 1024;

/**
 * Yields the `data` of each server-sent event, `[DONE]` included. Comment lines (`: keep-alive`) are dropped and do not
 * call `onData`, so they never reset an idle timer. Stopping early, a read error, or `signal` aborting cancels the body
 * and releases it; an abort then throws the signal's reason.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>, onData: () => void, signal?: AbortSignal): AsyncGenerator<string> {
  signal?.throwIfAborted();
  const reader = body.getReader();
  const onAbort = () => { void reader.cancel(signal?.reason).catch(() => undefined); };
  signal?.addEventListener("abort", onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];
  let eventChars = 0;
  const takeLine = (line: string): string | undefined => {
    if (line === "") {
      if (dataLines.length === 0) return undefined;
      const data = dataLines.join("\n");
      dataLines = [];
      eventChars = 0;
      return data;
    }
    if (line.startsWith(":")) return undefined;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== "data") return undefined;
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    eventChars += value.length;
    if (eventChars > MAX_EVENT_CHARS) throw new Error("DeepSeek stream event is too large.");
    dataLines.push(value);
    return undefined;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        const data = takeLine(line);
        if (data !== undefined) { onData(); yield data; }
        newline = buffer.indexOf("\n");
      }
      if (buffer.length > MAX_EVENT_CHARS) throw new Error("DeepSeek stream event is too large.");
      if (done) break;
    }
    if (buffer) takeLine(buffer.replace(/\r$/, ""));
    const last = takeLine("");
    if (last !== undefined) { onData(); yield last; }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
