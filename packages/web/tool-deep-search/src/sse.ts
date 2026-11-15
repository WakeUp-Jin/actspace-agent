/** One SSE event larger than this is treated as a broken stream rather than buffered without bound. */
const MAX_EVENT_CHARS = 8 * 1024 * 1024;

/**
 * Yields the `data` of each server-sent event, `[DONE]` included. Comment lines (`: keep-alive`) are dropped and do not
 * call `onData`, so they never reset an idle timer. Stopping early, or a read error, cancels the body and releases it.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>, onData: () => void): AsyncGenerator<string> {
  const reader = body.getReader();
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
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
