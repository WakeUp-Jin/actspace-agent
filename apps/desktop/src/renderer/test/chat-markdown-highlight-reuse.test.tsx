import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 数高亮插件被初始化了几次：rehype-highlight 每次初始化都 createLowlight，把全部语言注册一遍（run6 合计 1.8 GB 分配）。
// react-markdown 每次渲染都重建处理器、重新初始化所有插件，所以插件里不能每次建 lowlight。
const highlightInitSpy = vi.hoisted(() => vi.fn());
vi.mock("rehype-highlight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("rehype-highlight")>();
  return { ...actual, default: function counted(this: unknown, ...args: Parameters<typeof actual.default>) { highlightInitSpy(); return actual.default.apply(this as never, args); } };
});

import { MarkdownProse } from "../components/messages/MarkdownProse";
import { ReplyStreamingContext } from "../components/messages/reply-streaming-context";

let frames: Array<() => void> = [];
beforeEach(() => {
  highlightInitSpy.mockClear();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());
const flushFrames = () => { for (let i = 0; i < 200 && frames.length > 0; i += 1) act(() => { const batch = frames; frames = []; batch.forEach((callback) => { callback(); }); }); };

const reply = (n: number) => Array.from({ length: n }, (_, i) => `第 ${i} 段\n\n\`\`\`ts\nconst x${i} = ${i};\n\`\`\``).join("\n\n");

describe("代码高亮", () => {
  it("多条回复、流式多帧都共用同一个高亮实例，不随渲染重建", () => {
    const view = render(<><MarkdownProse content={reply(3)} /><MarkdownProse content={reply(2)} /></>);
    const content = reply(4);
    view.rerender(<ReplyStreamingContext.Provider value={true}><MarkdownProse content={content.slice(0, 40)} /></ReplyStreamingContext.Provider>);
    for (let end = 60; end <= content.length; end += 20) {
      view.rerender(<ReplyStreamingContext.Provider value={true}><MarkdownProse content={content.slice(0, end)} /></ReplyStreamingContext.Provider>);
      flushFrames();
    }
    expect(view.container.querySelector(".hljs")).not.toBeNull();
    expect(highlightInitSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
