import { act, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 尾部解析降频与原样尾巴（front-流式Markdown解析降频规范.md §5）：按 mock 的网络批次逐帧回放，
 * 时钟是假的（performance.now 由测试推进），rAF 手动排队。
 */

const hoisted = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../components/messages/markdown/processor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/messages/markdown/processor")>();
  return { ...actual, renderMarkdown: (...args: Parameters<typeof actual.renderMarkdown>) => { hoisted.calls += 1; return actual.renderMarkdown(...args); } };
});
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg></svg>", diagramType: "flowchart-v2" })) } }));

import { MarkdownProse } from "../components/messages/MarkdownProse";
import { ReplyStreamingContext } from "../components/messages/reply-streaming-context";
import { processorCreations } from "../components/messages/markdown/processor";
import { MARKDOWN_SHOWCASE_REPLY, networkBatches } from "../mock/markdown-fixture";

/** run7 里最长的一条真实回复（7.7K 字，60 行）。 */
const REAL_REPLY = readFileSync(join(__dirname, "fixtures", "markdown-stream-real-reply.md"), "utf8");
const FRAME_MS = 1000 / 60;

let clock = 0;
let frames: Array<() => void> = [];
beforeEach(() => {
  clock = 0;
  frames = [];
  hoisted.calls = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function view(content: string, streaming: boolean) {
  return (
    <ReplyStreamingContext.Provider value={streaming}>
      <MarkdownProse content={content} />
    </ReplyStreamingContext.Provider>
  );
}

const prose = (container: HTMLElement) => container.querySelector<HTMLElement>(".markdown-prose")!;

/** useId 生成的前缀每个实例不同，比较前统一掉。 */
const normalize = (html: string) => html.replace(/user-content-[\w]+-/g, "user-content-X-");

type FrameCheck = (root: HTMLElement) => void;

/**
 * 逐帧回放：每帧时钟前进 1/60 秒，先交付到时间的网络批次，再跑这一帧的 rAF。网络发完、积压放完后结束这一轮。
 * `frameStep`：每帧时钟前进多少（给一个很大的值，每帧都满足 100ms 规则，相当于改前的「每帧解析」）。
 */
function replay(text: string, options: { frameStep?: number; onFrame?: FrameCheck } = {}) {
  const { chunks, delays } = networkBatches(text);
  const arrivals: number[] = [];
  delays.reduce((at, delay, index) => (arrivals[index] = at + delay), 0);
  const step = options.frameStep ?? FRAME_MS;
  let delivered = 0;
  let content = "";
  let networkTime = 0;
  let textFrames = 0;
  const rendered = render(view("", true));
  for (let guard = 0; guard < 20_000; guard += 1) {
    clock += step;
    networkTime += FRAME_MS;
    while (delivered < chunks.length && arrivals[delivered] <= networkTime) {
      content += chunks[delivered];
      delivered += 1;
      rendered.rerender(view(content, true));
    }
    if (frames.length > 0) {
      const before = prose(rendered.container).textContent;
      act(() => { const batch = frames; frames = []; batch.forEach((callback) => callback()); });
      if (prose(rendered.container).textContent !== before) textFrames += 1;
      options.onFrame?.(prose(rendered.container));
    }
    if (delivered === chunks.length && frames.length === 0) break;
  }
  expect(content).toBe(text);
  rendered.rerender(view(text, false));
  return { ...rendered, textFrames };
}

/** 两个懒加载 chunk（数学、HTML）先加载好：回放和一次性渲染都直接用，不比较加载前的原文状态。 */
async function preloadChunks() {
  const preload = render(view("公式 $x$ 和 <kbd>K</kbd>", false));
  await waitFor(() => expect(preload.container.querySelector(".katex")).not.toBeNull());
  await waitFor(() => expect(preload.container.querySelector("kbd")).not.toBeNull());
  preload.unmount();
}

describe("等价：逐帧回放结束后的 DOM 与一次性渲染相同", () => {
  for (const [name, text] of [["Markdown 全元素回复", MARKDOWN_SHOWCASE_REPLY], ["run7 最长回复", REAL_REPLY]] as const) {
    it(name, async () => {
      await preloadChunks();
      const streamed = replay(text);
      // 一次性渲染放在回放之后：流式写过的代码块不折叠（CodeBlock 记住了它们），两边才可比。
      const direct = render(view(text, false));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(prose(streamed.container).querySelector(".md-tail-raw, .md-caret, .md-tail, act-fade, act-stream-tail")).toBeNull();
      expect(normalize(prose(streamed.container).innerHTML)).toBe(normalize(prose(direct.container).innerHTML));
    }, 30_000);
  }
});

describe("降频：解析次数", () => {
  for (const [name, text] of [["Markdown 全元素回复", MARKDOWN_SHOWCASE_REPLY], ["run7 最长回复", REAL_REPLY]] as const) {
    it(`${name}：块的解析渲染次数不超过每帧解析的 1/4`, async () => {
      await preloadChunks();
      hoisted.calls = 0;
      const everyFrame = replay(text, { frameStep: 1_000 });
      const baseline = hoisted.calls;
      everyFrame.unmount();
      hoisted.calls = 0;
      replay(text);
      const throttled = hoisted.calls;
      expect(baseline).toBeGreaterThan(everyFrame.textFrames);
      expect(throttled * 4).toBeLessThanOrEqual(baseline);
    }, 30_000);
  }

  it("处理器常驻：同一种管线连续渲染 100 次只建一次处理器", () => {
    const before = processorCreations();
    const rendered = render(view("第 00 次", false));
    // 内容等长：长度变了又不是追加时，平滑输出会有一次带积压的渲染（用到带末尾效果的另一种管线），这里只看同一种管线。
    for (let i = 1; i < 100; i += 1) rendered.rerender(view(`第 ${String(i).padStart(2, "0")} 次`, false));
    expect(prose(rendered.container).textContent).toBe("第 99 次");
    expect(processorCreations() - before).toBeLessThanOrEqual(1);
  });
});

describe("原样尾巴", () => {
  it("两次解析之间新放出的字逐帧出现，光标在尾巴后面", () => {
    const text = "开头一段普通的文字，".repeat(3) + "后面继续写很长很长的一句话，没有任何格式标记，".repeat(8);
    let previous = "";
    let rawFrames = 0;
    replay(text, {
      onFrame: (root) => {
        const shown = root.textContent ?? "";
        expect(text.startsWith(shown)).toBe(true);
        expect(shown.length).toBeGreaterThanOrEqual(previous.length);
        previous = shown;
        const raw = root.querySelector(".md-tail-raw");
        const carets = root.querySelectorAll(".md-caret");
        expect(carets).toHaveLength(1);
        if (raw?.textContent) {
          rawFrames += 1;
          expect(raw.lastElementChild).toBe(carets[0]);
        }
      },
    });
    // 确实有帧是靠原样尾巴显示的（没有重新解析）。
    expect(rawFrames).toBeGreaterThan(0);
  });

  it("尾巴里从不出现换行：遇到换行同一帧就解析；新的一行按块类型显示", () => {
    replay(MARKDOWN_SHOWCASE_REPLY, {
      onFrame: (root) => {
        for (const raw of Array.from(root.querySelectorAll(".md-tail-raw"))) {
          if (raw.closest("pre")) continue;
          expect(raw.textContent).not.toContain("\n");
        }
        // 一行开头的块标记不会作为原样文字挂在别的块后面（例如「## 改了什么」不会先接在上一段末尾）。
        for (const raw of Array.from(root.querySelectorAll(".md-tail-raw"))) {
          if (raw.closest("pre")) continue;
          expect(raw.textContent).not.toMatch(/^\s*(#{1,6}|[-*+]|\d+[.)]|>)\s/);
        }
      },
    });
  }, 30_000);

  it("写完时立即完整解析：没有尾巴、渐显和光标", () => {
    const text = "第一段\n\n第二段 **加粗** 和 `code` 结尾";
    const rendered = replay(text);
    for (let i = 0; i < 100 && frames.length > 0; i += 1) act(() => { const batch = frames; frames = []; batch.forEach((callback) => callback()); });
    const root = prose(rendered.container);
    expect(root.querySelector(".md-tail-raw, .md-caret, .md-tail")).toBeNull();
    expect(root.querySelector("strong")?.textContent).toBe("加粗");
    expect(root.querySelector("p:last-child code")?.textContent).toBe("code");
  });
});

describe("代码块", () => {
  it("没闭合时尾巴接在代码区里，不放光标；代码行数只增不减", () => {
    const code = Array.from({ length: 12 }, (_, i) => `const value${i} = compute(${i}) + another(${i * 2});`).join("\n");
    const text = `看代码：\n\n\`\`\`ts\n${code}\n\`\`\`\n\n结束。`;
    let lines = 0;
    let tailInCode = 0;
    replay(text, {
      onFrame: (root) => {
        const codeElement = root.querySelector("pre code");
        if (!codeElement) return;
        const count = (codeElement.textContent ?? "").replace(/\n$/, "").split("\n").length;
        expect(count).toBeGreaterThanOrEqual(lines);
        lines = count;
        const raw = root.querySelector("pre .md-tail-raw");
        if (raw) {
          tailInCode += 1;
          expect(raw.parentElement?.tagName).toBe("CODE");
        }
        if (root.querySelector(".md-code-live")) expect(root.querySelector("pre .md-caret")).toBeNull();
      },
    });
    expect(tailInCode).toBeGreaterThan(0);
    expect(lines).toBe(12);
  });
});
