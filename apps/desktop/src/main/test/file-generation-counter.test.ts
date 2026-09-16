// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FileGenerationCounter } from "../runtime-v2/file-generation-counter";

describe("file generation character counter", () => {
  it("counts decoded code points at every split boundary without counting metadata", () => {
    const content = '中文\n"quoted" \\ 😀';
    const json = JSON.stringify({ path: "a-long-path.txt", metadata: { content: "ignored" }, content });
    for (let split = 0; split <= json.length; split++) {
      const counter = new FileGenerationCounter("content");
      counter.accept(json.slice(0, split));
      counter.accept(json.slice(split));
      expect(counter.count).toBe([...content].length);
    }
  });
  it("handles one-code-unit chunks, escaped keys and Unicode surrogate escapes", () => {
    const counter = new FileGenerationCounter("content");
    const json = '{"con\\u0074ent":"\\u4e2d\\ud83d\\ude00\\n\\\\\\\""}';
    for (const char of json) counter.accept(char);
    expect(counter.count).toBe([...JSON.parse(json).content].length);
  });
  it("counts edit replacement content only, including an unfinished string", () => {
    const counter = new FileGenerationCounter("new_string");
    counter.accept('{"old_string":"old text","path":"a","new_string":"new');
    expect(counter.count).toBe(3);
    counter.accept(' text"}');
    expect(counter.count).toBe(8);
  });
  it("counts content larger than the retired partial argument buffer", () => {
    const counter = new FileGenerationCounter("content");
    counter.accept('{"content":"');
    for (let i = 0; i < 100; i++) counter.accept("x".repeat(2_000));
    expect(counter.count).toBe(200_000);
  });
});
