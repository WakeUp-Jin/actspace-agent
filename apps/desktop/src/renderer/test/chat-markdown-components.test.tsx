import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { MarkdownHostContext, type MarkdownHost } from "../components/messages/markdown/host";
import { ReplyStreamingContext } from "../components/messages/reply-streaming-context";

/** 代码块、路径、链接、图片组件（规范 §5.1、§5.2、§5.5，T18 / T24）。 */

// 平滑输出按 rAF 放字：用手动队列，需要时 flush 到放完。
let frames: Array<() => void> = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
});
const flush = () => { for (let i = 0; i < 300 && frames.length > 0; i += 1) act(() => { const batch = frames; frames = []; batch.forEach((callback) => { callback(); }); }); };

const lines = (count: number) => Array.from({ length: count }, (_, i) => `const line${i + 1} = ${i + 1};`).join("\n");
const fence = (body: string, info = "ts") => `\`\`\`${info}\n${body}\n\`\`\``;

function withHost(host: MarkdownHost, children: ReactNode) {
  return <MarkdownHostContext.Provider value={host}>{children}</MarkdownHostContext.Provider>;
}

describe("CodeBlock", () => {
  it("挂载时已闭合且超过 22 行：折叠，按钮写明总行数，展开后变成「收起」", async () => {
    const { container } = render(<MarkdownProse content={fence(lines(30))} />);
    const shell = container.querySelector(".md-code")!;
    expect(shell).toHaveAttribute("data-folded", "true");
    const toggle = screen.getByRole("button", { name: "展开全部 30 行" });
    await userEvent.click(toggle);
    expect(shell).not.toHaveAttribute("data-folded");
    expect(screen.getByRole("button", { name: "收起" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(shell).toHaveAttribute("data-folded", "true");
  });

  it("恰好 22 行或更少：不折叠、没有展开按钮", () => {
    const { container } = render(<MarkdownProse content={fence(lines(22))} />);
    expect(container.querySelector(".md-code")).not.toHaveAttribute("data-folded");
    expect(container.querySelector(".md-code-fold")).toBeNull();
  });

  it("流式写出来的代码块：一路写到超过 22 行也不折叠，写完也不自动收起", () => {
    const stream = (body: string, closed: boolean) => (
      <ReplyStreamingContext.Provider value={true}>
        <MarkdownProse content={closed ? `${fence(body)}\n` : `\`\`\`ts\n${body}\n`} />
      </ReplyStreamingContext.Provider>
    );
    const view = render(stream(lines(3), false));
    expect(view.container.querySelector(".md-code")).not.toHaveAttribute("data-folded");
    view.rerender(stream(lines(40), false));
    flush();
    expect(view.container.querySelector(".md-code")).not.toHaveAttribute("data-folded");
    expect(view.container.querySelector(".md-code-live")?.textContent).toBe("写入中 · 40 行");
    view.rerender(stream(lines(40), true));
    flush();
    expect(view.container.querySelector(".md-code")).not.toHaveAttribute("data-folded");
    expect(view.container.querySelector(".md-code-fold")).toBeNull();
    expect(view.container.querySelector(".md-code-live")).toBeNull();
  });

  it("流式写完、回复落盘重新挂载后，同一段代码也不折叠；没流式写过的同样长度的代码照常折叠", () => {
    const body = lines(36);
    const streamed = render(
      <ReplyStreamingContext.Provider value={true}>
        <MarkdownProse content={"```ts\n" + body.split("\n").slice(0, 5).join("\n") + "\n"} />
      </ReplyStreamingContext.Provider>,
    );
    streamed.rerender(
      <ReplyStreamingContext.Provider value={true}>
        <MarkdownProse content={`${fence(body)}\n`} />
      </ReplyStreamingContext.Provider>,
    );
    flush();
    streamed.unmount();
    const committed = render(<MarkdownProse content={fence(body)} />);
    expect(committed.container.querySelector(".md-code")).not.toHaveAttribute("data-folded");
    expect(committed.container.querySelector(".md-code-fold")).toBeNull();
    committed.unmount();
    const other = render(<MarkdownProse content={fence(body, "js")} />);
    expect(other.container.querySelector(".md-code")).toHaveAttribute("data-folded", "true");
  });

  it("流式中围栏没闭合：头部显示「写入中 · N 行」，没有换行和复制按钮；闭合后换成按钮", () => {
    const stream = (content: string) => <ReplyStreamingContext.Provider value={true}><MarkdownProse content={content} /></ReplyStreamingContext.Provider>;
    const view = render(stream("```ts\nconst a = 1;\nconst b = 2;\n"));
    expect(screen.getByRole("status")).toHaveTextContent("写入中 · 2 行");
    expect(screen.queryByRole("button", { name: "复制代码" })).toBeNull();
    // 收尾围栏要等这一行写完（换行到达或流式结束）才放出，见 smooth-text.ts。
    view.rerender(stream("```ts\nconst a = 1;\nconst b = 2;\n```\n"));
    flush();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "复制代码" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自动换行" })).toBeInTheDocument();
  });

  it("复制的是代码原文，不含围栏，复制后 1.2 秒内显示「已复制」", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MarkdownProse content={"```ts\nconst answer = 42;\n```"} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "复制代码" })); });
    expect(writeText).toHaveBeenCalledWith("const answer = 42;\n");
    expect(writeText.mock.calls[0][0]).not.toContain("```");
    await waitFor(() => expect(screen.getByText("已复制")).toBeInTheDocument());
  });

  it("换行按钮只切换当前代码块", async () => {
    const { container } = render(<MarkdownProse content={`${fence("a")}\n\n${fence("b")}`} />);
    const [first, second] = Array.from(container.querySelectorAll(".md-code"));
    await userEvent.click(first.querySelector("button[aria-label='自动换行']")!);
    expect(first).toHaveAttribute("data-wrap", "true");
    expect(second).not.toHaveAttribute("data-wrap");
    expect(first.querySelector("button[aria-label='自动换行']")).toHaveAttribute("aria-pressed", "true");
  });

  it("语言显示名：标了语言用显示名，没标写「文本」；未收录的语言原样显示", () => {
    const { container } = render(<MarkdownProse content={`${fence("a", "bash")}\n\n${fence("b", "")}\n\n${fence("c", "zig")}`} />);
    expect(Array.from(container.querySelectorAll(".md-code-lang")).map((n) => n.textContent)).toEqual(["Shell", "文本", "zig"]);
  });

  it("title= 显示成文件名；是工作区路径且有宿主时可点，带行号用行号打开", async () => {
    const openPath = vi.fn();
    render(<MarkdownProse content={fence("x", 'ts title="src/app.ts:12"')} onOpenWorkspaceFile={openPath} />);
    await userEvent.click(screen.getByRole("button", { name: /src\/app\.ts:12/ }));
    expect(openPath).toHaveBeenCalledWith("src/app.ts", 12);
  });

  it("title= 没有宿主时只是文字，不可点", () => {
    render(<MarkdownProse content={fence("x", 'ts title="src/app.ts"')} />);
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /src\/app\.ts/ })).toBeNull();
  });

  it("标了语言的代码块带 language-* 类名", () => {
    const { container } = render(<MarkdownProse content={"```py\nprint(1)\n```"} />);
    expect(container.querySelector("pre code")?.className).toContain("language-py");
  });
});

describe("InlineCode 路径", () => {
  it("有宿主时，行内路径是可点的文件：单击打开", async () => {
    const openPath = vi.fn();
    const { container } = render(<MarkdownProse content={"改了 `src/app.ts` 这个文件"} onOpenWorkspaceFile={openPath} />);
    const chip = container.querySelector("code.md-path")!;
    expect(chip).toHaveAttribute("role", "button");
    expect(chip.textContent).toBe("src/app.ts");
    expect(chip.querySelector(".md-path-lead")?.textContent).toBe("s");
    expect(chip.querySelector(".md-path-lead svg")).not.toBeNull();
    await userEvent.click(chip);
    expect(openPath).toHaveBeenCalledWith("src/app.ts");
    expect(openPath.mock.calls[0]).toHaveLength(1);
  });

  it("带行号的路径：用行号打开，提示里写明第几行", async () => {
    const openPath = vi.fn();
    const { container } = render(<MarkdownProse content={"见 `src/app.ts:42` 附近"} onOpenWorkspaceFile={openPath} />);
    const chip = container.querySelector("code.md-path")!;
    expect(chip).toHaveAttribute("title", "在 ActSpace 中打开（第 42 行）");
    await userEvent.click(chip);
    expect(openPath).toHaveBeenCalledWith("src/app.ts", 42);
  });

  it("键盘：聚焦后回车和空格都能打开", async () => {
    const openPath = vi.fn();
    const { container } = render(<MarkdownProse content={"`src/app.ts`"} onOpenWorkspaceFile={openPath} />);
    const chip = container.querySelector<HTMLElement>("code.md-path")!;
    chip.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(openPath).toHaveBeenCalledTimes(2);
  });

  it("没有宿主时：路径只是普通行内代码，不可点", () => {
    const { container } = render(<MarkdownProse content={"改了 `src/app.ts:42`"} />);
    const code = container.querySelector("code")!;
    expect(code).not.toHaveClass("md-path");
    expect(code).not.toHaveAttribute("role");
    expect(code.textContent).toBe("src/app.ts:42");
  });

  it("不是工作区路径的行内代码（命令、越界路径、绝对路径）保持普通代码", async () => {
    const openPath = vi.fn();
    const { container } = render(<MarkdownProse content={"`npm run build` `../secret.txt` `~/.zshrc` `foo()`"} onOpenWorkspaceFile={openPath} />);
    expect(container.querySelector("code.md-path")).toBeNull();
    for (const code of Array.from(container.querySelectorAll("code"))) await userEvent.click(code);
    expect(openPath).not.toHaveBeenCalled();
  });

  it("代码块里的路径和链接文字里的路径不识别", () => {
    const { container } = render(<MarkdownProse content={"```\nsrc/app.ts\n```\n\n[`src/app.ts`](https://example.com)"} onOpenWorkspaceFile={() => {}} />);
    expect(container.querySelector("code.md-path")).toBeNull();
  });

  it("可以通过 context 提供宿主能力（没有 onOpenWorkspaceFile prop 时）", async () => {
    const openPath = vi.fn();
    const { container } = render(withHost({ openPath }, <MarkdownProse content={"`src/a.ts`"} />));
    await userEvent.click(container.querySelector("code.md-path")!);
    expect(openPath).toHaveBeenCalledWith("src/a.ts");
  });
});

describe("MarkdownLink", () => {
  it("网页链接新窗口打开，只放行 http/https/mailto", () => {
    render(<MarkdownProse content={"[甲](https://example.com) [乙](mailto:a@b.co) [丙](javascript:alert(1)) [丁](ftp://x.test)"} />);
    const link = screen.getByRole("link", { name: "甲" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noopener/);
    expect(screen.getByRole("link", { name: "乙" })).toHaveAttribute("href", "mailto:a@b.co");
    expect(screen.queryByRole("link", { name: "丙" })).toBeNull();
    expect(screen.queryByRole("link", { name: "丁" })).toBeNull();
    expect(screen.getByText("丙")).toBeInTheDocument();
  });

  it("本地链接：有宿主时前面有文件图标、单击打开；没有宿主时是普通文字", async () => {
    const openPath = vi.fn();
    const view = render(<MarkdownProse content={"看 [入口](src/main.ts) 和 [带行号](src/main.ts:7)"} onOpenWorkspaceFile={openPath} />);
    const link = view.container.querySelector<HTMLAnchorElement>("a.md-link-file")!;
    expect(link.textContent).toBe("入口");
    // 图标和第一个字符在同一个不换行的 span 里，窄的时候图标不会单独留在上一行末尾
    expect(link.querySelector(".md-path-lead")?.textContent).toBe("入");
    expect(link.querySelector(".md-path-lead svg")).not.toBeNull();
    await userEvent.click(link);
    expect(openPath).toHaveBeenCalledWith("src/main.ts");
    view.unmount();
    render(<MarkdownProse content={"看 [入口](src/main.ts)"} />);
    expect(screen.queryByRole("link", { name: "入口" })).toBeNull();
    expect(screen.getByText("入口")).toBeInTheDocument();
  });

  it("越界的本地链接不可点", () => {
    render(<MarkdownProse content={"[越界](../../etc/passwd)"} onOpenWorkspaceFile={() => {}} />);
    expect(screen.queryByRole("link", { name: "越界" })).toBeNull();
  });
});

describe("MarkdownImage（T22）", () => {
  it("远程图片不加载：没有 img、没有网络请求，显示占位和提示", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(""));
    const { container } = render(<MarkdownProse content={"![架构图](https://tracker.test/a.png)"} />);
    expect(container.querySelector("img")).toBeNull();
    const note = screen.getByText("图片：架构图（远程地址，不加载）");
    expect(note).toHaveAttribute("title", "远程图片不加载");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("本地图片经宿主 loadImage 读取：先显示读取中，读到后显示图片，同一路径只读一次", async () => {
    const loadImage = vi.fn().mockResolvedValue("data:image/png;base64,AAAA");
    const { container } = render(withHost({ loadImage }, <MarkdownProse content={"![图一](docs/a.png)\n\n![图一又来](docs/a.png)"} />));
    expect(screen.getAllByText(/读取中/).length).toBeGreaterThan(0);
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
    expect(container.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(loadImage).toHaveBeenCalledWith("docs/a.png");
  });

  it("读取失败显示淡色占位「找不到文件」", async () => {
    const loadImage = vi.fn().mockResolvedValue(null);
    render(withHost({ loadImage }, <MarkdownProse content={"![缺图](docs/none.png)"} />));
    await waitFor(() => expect(screen.getByText("图片：缺图（找不到文件）")).toBeInTheDocument());
  });

  it("loadImage 抛错也只是占位，不影响其他内容", async () => {
    const loadImage = vi.fn().mockRejectedValue(new Error("boom"));
    render(withHost({ loadImage }, <MarkdownProse content={"![坏](docs/x.png)\n\n后面的正文"} />));
    await waitFor(() => expect(screen.getByText("图片：坏（找不到文件）")).toBeInTheDocument());
    expect(screen.getByText("后面的正文")).toBeInTheDocument();
  });

  it("没有 loadImage（远端会话）：占位；宿主能打开文件时单击打开", async () => {
    const openPath = vi.fn();
    const view = render(<MarkdownProse content={"![图](docs/a.png)"} />);
    expect(screen.getByText("图片：图（无法预览）")).toBeInTheDocument();
    view.unmount();
    render(<MarkdownProse content={"![图](docs/a.png)"} onOpenWorkspaceFile={openPath} />);
    await userEvent.click(screen.getByRole("button", { name: /图片：图/ }));
    expect(openPath).toHaveBeenCalledWith("docs/a.png");
  });

  it("越界路径的图片不读取", () => {
    const loadImage = vi.fn();
    render(withHost({ loadImage }, <MarkdownProse content={"![越界](../../etc/passwd)"} />));
    expect(loadImage).not.toHaveBeenCalled();
  });
});

describe("表格", () => {
  it("外层容器负责横向滚动；流式中根节点带 data-streaming（CSS 据此固定列宽）", () => {
    const content = "| 名称 | 数量 |\n|---|--:|\n| 甲 | 12 |\n| 乙 | 345 |";
    const view = render(<MarkdownProse content={content} />);
    expect(view.container.querySelector(".markdown-table-wrap > table")).not.toBeNull();
    expect(view.container.querySelector("td[align='right'], td[style*='right']")).not.toBeNull();
    expect(view.container.querySelector(".markdown-prose")).not.toHaveAttribute("data-streaming");
    view.unmount();
    const live = render(<ReplyStreamingContext.Provider value={true}><MarkdownProse content={content} /></ReplyStreamingContext.Provider>);
    expect(live.container.querySelector(".markdown-prose")).toHaveAttribute("data-streaming", "true");
  });
});
