import { act, render } from "@testing-library/react";
import { memo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 包一层 renderMarkdown（每块一次解析渲染），数每个块被渲染了几次（性能约束：规范 §12 稳定引用、§9.1 每帧只渲染最后一块）。
const markdownSpy = vi.hoisted(() => vi.fn());
vi.mock("../components/messages/markdown/processor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/messages/markdown/processor")>();
  return { ...actual, renderMarkdown: (...args: Parameters<typeof actual.renderMarkdown>) => { markdownSpy(args[0]); return actual.renderMarkdown(...args); } };
});

import { MarkdownProse } from "../components/messages/MarkdownProse";
import { ReplyStreamingContext } from "../components/messages/reply-streaming-context";

// 平滑输出按 rAF 放字：用手动队列，测试里 flush 到放完为止。
let frames: Array<() => void> = [];
beforeEach(() => {
  markdownSpy.mockClear();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());
const flushFrames = () => { for (let i = 0; i < 200 && frames.length > 0; i += 1) act(() => { const batch = frames; frames = []; batch.forEach((callback) => callback()); }); };

const renderedSources = () => markdownSpy.mock.calls.map((call) => String(call[0]));
const countOf = (needle: string) => renderedSources().filter((source) => source.includes(needle)).length;

function streaming(content: string) {
  return (
    <ReplyStreamingContext.Provider value={true}>
      <MarkdownProse content={content} />
    </ReplyStreamingContext.Provider>
  );
}

describe("渲染次数", () => {
  it("流式追加时，已经冻结的前面的块不重新渲染", () => {
    const view = render(streaming("第一块\n\n第二块\n\n第三块\n\n第四块"));
    markdownSpy.mockClear();
    view.rerender(streaming("第一块\n\n第二块\n\n第三块\n\n第四块继续写"));
    flushFrames();
    expect(countOf("第一块")).toBe(0);
    expect(countOf("第二块")).toBe(0);
    expect(countOf("第四块继续写")).toBe(1);
  });

  it("新块出现时，更早的块不动；刚退下来的上一块只多渲染几次（块间换行到达、去掉末尾效果）", () => {
    const view = render(streaming("甲块\n\n乙块\n\n丙块"));
    markdownSpy.mockClear();
    view.rerender(streaming("甲块\n\n乙块\n\n丙块\n\n丁块"));
    flushFrames();
    expect(countOf("甲块")).toBe(0);
    expect(countOf("乙块")).toBe(0);
    // 丙块的源码带着块间的换行：换行一个字符一个字符放出来，各渲染一次，再加上退下末尾效果的一次。
    expect(countOf("丙块")).toBeGreaterThan(0);
    expect(countOf("丙块")).toBeLessThanOrEqual(3);
    expect(countOf("丁块")).toBeGreaterThan(0);
  });

  it("历史回复：父组件重渲染、props 没变时，整条回复不重渲染", () => {
    const openPath = vi.fn();
    let bump: () => void = () => {};
    const Parent = memo(function Parent() { return null; });
    function Host() {
      const [, set] = useState(0);
      bump = () => set((n) => n + 1);
      return <><Parent /><MarkdownProse content={"历史一\n\n历史二"} onOpenWorkspaceFile={openPath} /></>;
    }
    render(<Host />);
    markdownSpy.mockClear();
    act(() => bump());
    act(() => bump());
    expect(markdownSpy).not.toHaveBeenCalled();
  });

  it("历史回复：所在轮的流式状态不变时，别的消息更新不会让它重渲染", () => {
    function Host({ other }: { other: string }) {
      return (
        <ReplyStreamingContext.Provider value={false}>
          <p>{other}</p>
          <MarkdownProse content={"历史回复内容\n\n第二段"} />
        </ReplyStreamingContext.Provider>
      );
    }
    const view = render(<Host other="a" />);
    markdownSpy.mockClear();
    view.rerender(<Host other="b" />);
    expect(markdownSpy).not.toHaveBeenCalled();
  });

  it("定义晚到：只重渲染引用了它的块", () => {
    const base = "见 [文档][doc]\n\n无关的一段\n\n另一段无关的";
    const view = render(<ReplyStreamingContext.Provider value={false}><MarkdownProse content={base} /></ReplyStreamingContext.Provider>);
    markdownSpy.mockClear();
    view.rerender(<ReplyStreamingContext.Provider value={false}><MarkdownProse content={`${base}\n\n[doc]: https://example.com`} /></ReplyStreamingContext.Provider>);
    expect(countOf("见 [文档][doc]")).toBe(1);
    expect(countOf("无关的一段")).toBe(0);
    expect(renderedSources().some((source) => source.includes("[doc]: https://example.com") && source.includes("见 [文档][doc]"))).toBe(true);
  });

  it("脚注内容变化（脚注定义还在流式写）时，引用它的块不重渲染", () => {
    const base = "正文引用[^1]\n\n中间一段\n\n[^1]: 注释写到一半";
    const view = render(streaming(base));
    markdownSpy.mockClear();
    view.rerender(streaming(`${base}，继续写完了`));
    flushFrames();
    expect(countOf("正文引用[^1]")).toBe(0);
    expect(countOf("继续写完了")).toBeGreaterThan(0);
  });
});
