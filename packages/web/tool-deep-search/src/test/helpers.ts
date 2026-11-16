import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function streamOf(pieces: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

export function fixture(name: "search-and-read" | "multi-step" | "no-search"): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}.sse.txt`, import.meta.url)), "utf8");
}

/** Splits an SSE transcript into the JSON chunks it carries, without the parser under test. */
export function fixtureChunks(name: Parameters<typeof fixture>[0]): unknown[] {
  return fixture(name).split(/\n\n/)
    .map(block => block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n"))
    .filter(data => data && data !== "[DONE]")
    .map(data => JSON.parse(data) as unknown);
}
