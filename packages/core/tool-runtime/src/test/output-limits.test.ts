import { describe, expect, it } from "vitest";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { ToolArtifactRef, ToolModelOutputBlock } from "../executor.js";
import { boundToolResult, sliceWholeChars, TOOL_BATCH_PENDING_CALL_CHARS, TOOL_RESULT_DETAIL_BYTES, TOOL_RESULT_MODEL_OUTPUT_BYTES, TOOL_RESULT_TEXT_FIELD_BYTES, ToolOutputBudget } from "../output-limits.js";
import type { ToolExecutionResult } from "../result.js";

const MIB = 1024 * 1024;

function result(overrides: Partial<ToolExecutionResult> = {}): ToolExecutionResult {
  return Object.freeze({
    status: "completed", callId: "call-1", pluginId: "plugin.test", name: "read", registrationId: "registration-1", definitionVersion: 1, definitionDigest: "digest",
    summary: "ok", modelOutput: [{ type: "text", text: "ok" }], detail: [], artifacts: [], finalizerFailures: [], dispatched: true,
    ...overrides,
  } as ToolExecutionResult);
}

function bytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value), "utf8"); }

/** 记下存了什么；返回的引用和 Host 给的形状一样。 */
function store() {
  const saved: string[] = [];
  const save = async (text: string): Promise<ToolArtifactRef> => {
    saved.push(text);
    return { artifactId: `artifact-${saved.length}`, mediaType: "text/plain", size: Buffer.byteLength(text, "utf8"), sha256: "0".repeat(64) };
  };
  return { saved, save };
}

function firstText(blocks: readonly ToolModelOutputBlock[]): string {
  const block = blocks[0];
  if (block?.type !== "text") throw new Error("expected a leading text block");
  return block.text;
}

describe("sliceWholeChars", () => {
  it("returns short text unchanged and cuts long text at the limit", () => {
    expect(sliceWholeChars("abc", 3)).toBe("abc");
    expect(sliceWholeChars("abcdef", 3)).toBe("abc");
    expect(sliceWholeChars("abc", 0)).toBe("");
  });
  it("drops a high surrogate that the cut would leave without its pair", () => {
    expect(sliceWholeChars("a🌱b", 2)).toBe("a");
    expect(sliceWholeChars("a🌱b", 3)).toBe("a🌱");
    expect(sliceWholeChars("🌱🌱", 1)).toBe("");
  });
});

describe("boundToolResult", () => {
  it("returns the same object when everything is within the limits", async () => {
    const { saved, save } = store();
    const input = result({ modelOutput: [{ type: "text", text: "x".repeat(64_000) }], detail: [{ label: "result", value: { additions: 1 } }] });
    expect(await boundToolResult(input, { saveFullOutput: save })).toBe(input);
    expect(saved).toEqual([]);
  });

  it("keeps the head of an oversized output, saves the full text and says so", async () => {
    const { saved, save } = store();
    const full = Array.from({ length: 60_000 }, (_, index) => `line ${index} ${"x".repeat(40)}`).join("\n");
    const input = result({ modelOutput: [{ type: "text", text: full }], artifacts: [{ artifactId: "earlier", mediaType: "image/png", size: 1, sha256: "1".repeat(64) }] });
    const bounded = await boundToolResult(input, { saveFullOutput: save });

    expect(saved).toEqual([full]);
    expect(bytes(bounded.modelOutput)).toBeLessThanOrEqual(TOOL_RESULT_MODEL_OUTPUT_BYTES);
    const text = firstText(bounded.modelOutput);
    const [head, note] = text.split("\n\n[Output truncated: ");
    // 停在整行上，是完整输出的开头。
    expect(full.startsWith(`${head}\n`)).toBe(true);
    expect(head!.length).toBeGreaterThan(200_000);
    expect(note).toBe(`this tool returned ${Buffer.byteLength(full)} bytes, more than one result can hold. The first ${Buffer.byteLength(head!)} bytes are shown. The full output was saved as a file.]`);
    expect(bounded.modelOutput.slice(1)).toEqual([{ type: "artifact", artifact: { artifactId: "artifact-1", mediaType: "text/plain", size: Buffer.byteLength(full), sha256: "0".repeat(64) }, label: "Full tool output" }]);
    expect(bounded.artifacts.map((artifact) => artifact.artifactId)).toEqual(["earlier", "artifact-1"]);
    expect(bounded.status).toBe("completed");
    expect(Object.isFrozen(bounded)).toBe(true);
    expect(input.modelOutput).toEqual([{ type: "text", text: full }]);
  });

  it("measures what the session record measures: serialized UTF-8 bytes, escapes included", async () => {
    for (const unit of ["汉字🌱", "\u0001", "\"\\\n"]) {
      const { save } = store();
      const full = unit.repeat(Math.ceil(400_000 / unit.length));
      const bounded = await boundToolResult(result({ modelOutput: [{ type: "text", text: full }] }), { saveFullOutput: save });
      const size = bytes(bounded.modelOutput);
      expect(size).toBeLessThanOrEqual(TOOL_RESULT_MODEL_OUTPUT_BYTES);
      // 留给说明的位置不到 2 KiB，其余都用上了。
      expect(size).toBeGreaterThan(TOOL_RESULT_MODEL_OUTPUT_BYTES - 2_048);
      const head = firstText(bounded.modelOutput).split("\n\n[Output truncated: ")[0]!;
      expect(full.startsWith(head)).toBe(true);
      // 没有把一个代理对切成两半。
      expect(Buffer.from(head, "utf8").toString("utf8")).toBe(head);
      expect(head).not.toContain("\uFFFD");
    }
  });

  it("merges text and json blocks in order and keeps file references", async () => {
    const { saved, save } = store();
    const value = { rows: Array.from({ length: 20_000 }, (_, index) => ({ index, name: `row-${index}` })) } as unknown as RuntimeJsonValue;
    const image = { type: "artifact" as const, artifact: { artifactId: "image-1", mediaType: "image/png", size: 10, sha256: "2".repeat(64) }, label: "Screenshot" };
    const bounded = await boundToolResult(result({ modelOutput: [{ type: "text", text: "Rows:" }, image, { type: "json", value }] }), { saveFullOutput: save });
    expect(saved).toEqual([`Rows:\n${JSON.stringify(value)}`]);
    expect(firstText(bounded.modelOutput).startsWith('Rows:\n{"rows":[{"index":0,"name":"row-0"}')).toBe(true);
    expect(bounded.modelOutput.slice(1).map((block) => block.type === "artifact" ? block.label : block.type)).toEqual(["Screenshot", "Full tool output"]);
    expect(bytes(bounded.modelOutput)).toBeLessThanOrEqual(TOOL_RESULT_MODEL_OUTPUT_BYTES);
  });

  it("still truncates when the full output cannot be saved", async () => {
    const full = "y".repeat(400_000);
    const input = result({ modelOutput: [{ type: "text", text: full }] });
    const bounded = await boundToolResult(input, { saveFullOutput: async () => { throw new Error("disk full"); } });
    expect(bounded.modelOutput).toHaveLength(1);
    expect(firstText(bounded.modelOutput)).toMatch(/^y{200000,}\n\n\[Output truncated: this tool returned 400000 bytes, more than one result can hold\. The first \d+ bytes are shown\. The full output could not be saved\.\]$/);
    expect(bounded.artifacts).toEqual([]);
    expect(bytes(bounded.modelOutput)).toBeLessThanOrEqual(TOOL_RESULT_MODEL_OUTPUT_BYTES);
  });

  it("never changes the outcome: a failed call stays failed with its code", async () => {
    const { save } = store();
    const input = result({ status: "failed", summary: "s".repeat(100_000), modelOutput: [{ type: "text", text: "z".repeat(MIB) }], failure: { code: "EDIT_CONFLICT", message: "m".repeat(100_000), retryable: true, phase: "body" } });
    const bounded = await boundToolResult(input, { saveFullOutput: save });
    expect(bounded.status).toBe("failed");
    expect(bounded.failure).toMatchObject({ code: "EDIT_CONFLICT", retryable: true, phase: "body" });
    for (const text of [bounded.summary, bounded.failure!.message]) {
      expect(text.endsWith(" ...[truncated]")).toBe(true);
      expect(bytes(text)).toBeLessThanOrEqual(TOOL_RESULT_TEXT_FIELD_BYTES);
      expect(text.length).toBeGreaterThan(16_000);
    }
  });

  it("replaces an oversized detail block and keeps the small ones after it", async () => {
    const { saved, save } = store();
    const input = result({ detail: [{ label: "stdout", value: "o".repeat(MIB) }, { label: "result", value: { additions: 3, deletions: 1 } }] });
    const bounded = await boundToolResult(input, { saveFullOutput: save });
    expect(bounded.detail).toEqual([
      { label: "stdout", value: `[Detail omitted: ${bytes({ label: "stdout", value: "o".repeat(MIB) }) + 1} bytes is over the size limit for one tool result.]` },
      { label: "result", value: { additions: 3, deletions: 1 } },
    ]);
    expect(bytes(bounded.detail)).toBeLessThanOrEqual(TOOL_RESULT_DETAIL_BYTES);
    expect(bounded.modelOutput).toBe(input.modelOutput);
    expect(saved).toEqual([]);
  });

  it("drops a renderer whose props are too large and leaves the rest alone", async () => {
    const { save } = store();
    const input = result({ renderer: { id: "plugin.test/table", schemaVersion: 1, props: { rows: "r".repeat(100_000) } } });
    const bounded = await boundToolResult(input, { saveFullOutput: save });
    expect("renderer" in bounded).toBe(false);
    expect({ ...bounded, renderer: input.renderer }).toEqual({ ...input });
  });

  it("keeps one result within the 1 MiB session record even when every part is oversized", async () => {
    const { save } = store();
    const huge = "汉".repeat(MIB);
    const input = result({
      status: "failed", summary: huge, failure: { code: "TOOL_EXECUTION_FAILED", message: huge, retryable: false, phase: "body" },
      modelOutput: [{ type: "text", text: huge }, { type: "json", value: { huge } }],
      detail: [{ label: "a", value: huge }, { label: "b", value: { huge } }],
      renderer: { id: "plugin.test/table", schemaVersion: 1, props: { huge } },
    });
    const bounded = await boundToolResult(input, { saveFullOutput: save });
    // Agent Loop 写进 tool/result 的就是这些字段。
    const data = { callId: bounded.callId, pluginId: bounded.pluginId, name: bounded.name, status: bounded.status, summary: bounded.summary, modelOutput: bounded.modelOutput, detail: bounded.detail, artifacts: bounded.artifacts, failure: bounded.failure ?? null, renderer: bounded.renderer ?? null };
    expect(bytes(data)).toBeLessThan(700 * 1024);
  });

  describe("with a context-window budget", () => {
    it("cuts an output that fits the byte limit but not what the window has room for", async () => {
      const { saved, save } = store();
      const full = Array.from({ length: 3_000 }, (_, index) => `第 ${index} 行`).join("\n");
      const bounded = await boundToolResult(result({ modelOutput: [{ type: "text", text: full }] }), { modelOutputChars: 10_000, saveFullOutput: save });
      expect(saved).toEqual([full]);
      const text = firstText(bounded.modelOutput);
      const [head, note] = text.split("\n\n[Output truncated: ");
      expect(full.startsWith(`${head}\n`)).toBe(true);
      expect(note).toBe(`this tool returned ${full.length} characters and the context window has room for about 10000. The first ${head!.length} characters are shown. The full output was saved as a file.]`);
      // 文字加上一个文件引用渲染后的长度（按 400 字符计）不超过额度，也没有浪费太多。
      expect(text.length + 400).toBeLessThanOrEqual(10_000);
      expect(text.length).toBeGreaterThan(8_000);
    });

    it("leaves an output alone when it is within the budget", async () => {
      const { saved, save } = store();
      const input = result({ modelOutput: [{ type: "text", text: "x".repeat(9_000) }] });
      expect(await boundToolResult(input, { modelOutputChars: 10_000, saveFullOutput: save })).toBe(input);
      expect(saved).toEqual([]);
    });

    it("never goes below the minimum, so the note and the file reference always fit", async () => {
      const { save } = store();
      const full = "x".repeat(50_000);
      for (const modelOutputChars of [0, -5, 100]) {
        const bounded = await boundToolResult(result({ modelOutput: [{ type: "text", text: full }] }), { modelOutputChars, saveFullOutput: save });
        const text = firstText(bounded.modelOutput);
        expect(text).toMatch(/^x{900,}\n\n\[Output truncated: this tool returned 50000 characters and the context window has room for about 2048\./);
        expect(text.length + 400).toBeLessThanOrEqual(2_048);
        expect(bounded.modelOutput).toHaveLength(2);
      }
    });

    it("ignores a budget that is not a finite number", async () => {
      const { save } = store();
      const input = result({ modelOutput: [{ type: "text", text: "x".repeat(50_000) }] });
      expect(await boundToolResult(input, { modelOutputChars: Number.NaN, saveFullOutput: save })).toBe(input);
      expect(await boundToolResult(input, { modelOutputChars: Number.POSITIVE_INFINITY, saveFullOutput: save })).toBe(input);
    });
  });
});

describe("ToolOutputBudget", () => {
  it("gives a single call the whole batch budget", () => {
    expect(new ToolOutputBudget(50_000, 1).take(80_000)).toBe(50_000);
  });

  it("holds back a fixed share for each call that has not produced its result yet", () => {
    const budget = new ToolOutputBudget(100_000, 5);
    // 先出结果的调用给后面 4 个各留 8,000。
    expect(budget.take(64_000)).toBe(100_000 - 4 * TOOL_BATCH_PENDING_CALL_CHARS);
    // 用了 64,000，剩 36,000：给后面 3 个各留 8,000。
    expect(budget.take(1_000)).toBe(36_000 - 3 * TOOL_BATCH_PENDING_CALL_CHARS);
    // 小结果没用完的部分留给后面的调用。
    expect(budget.take(500)).toBe(35_000 - 2 * TOOL_BATCH_PENDING_CALL_CHARS);
    expect(budget.take(500)).toBe(34_500 - TOOL_BATCH_PENDING_CALL_CHARS);
    expect(budget.take(500)).toBe(34_000);
  });

  it("splits evenly when the budget cannot hold back the fixed share for everyone", () => {
    const budget = new ToolOutputBudget(20_000, 4);
    expect([budget.take(50_000), budget.take(50_000), budget.take(50_000), budget.take(50_000)]).toEqual([5_000, 5_000, 5_000, 5_000]);
  });

  it("hands out exactly the batch budget when every result is large", () => {
    for (const [total, calls] of [[346_000, 10], [60_000, 4], [100_000, 3], [9_000, 2]] as const) {
      const budget = new ToolOutputBudget(total, calls);
      let used = 0;
      for (let index = 0; index < calls; index++) used += Math.min(64_000, budget.take(64_000));
      expect(used).toBe(total);
    }
  });

  it("counts a result cut to the minimum size as that size and stays at zero once used up", () => {
    const budget = new ToolOutputBudget(1_000, 3);
    // 每个调用的额度都不到最小值，截短后的结果按最小值 2,048 计。
    expect(budget.take(64_000)).toBe(334);
    expect(budget.take(64_000)).toBe(0);
    expect(budget.take(64_000)).toBe(0);
  });

  it("treats a non-positive budget as empty", () => {
    expect(new ToolOutputBudget(-5, 2).take(100)).toBe(0);
    expect(new ToolOutputBudget(0, 0).take(100)).toBe(0);
  });
});
