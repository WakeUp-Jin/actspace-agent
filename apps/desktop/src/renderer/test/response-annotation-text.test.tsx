import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { ReplyStreamingContext } from "../components/messages/reply-streaming-context";
import {
  collectAnnotatableText,
  createAnnotationDraft,
  offsetsToRange,
  rangeToOffsets,
  resolveAnnotation,
} from "../components/messages/response-annotation-text";

function renderReply(content: string): HTMLElement {
  const { container } = render(<MarkdownProse content={content} />);
  return container.querySelector<HTMLElement>(".markdown-prose")!;
}

/** 在 root 内找到包含 needle 的文本节点，返回 needle 起点（或终点）对应的 DOM 位置。 */
function textPoint(root: HTMLElement, needle: string, edge: "start" | "end" = "start"): [Text, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const index = (node as Text).data.indexOf(needle);
    if (index >= 0) return [node as Text, edge === "start" ? index : index + needle.length];
  }
  throw new Error(`text not found: ${needle}`);
}

function selectBetween(root: HTMLElement, from: string, to: string): Range {
  const range = document.createRange();
  range.setStart(...textPoint(root, from, "start"));
  range.setEnd(...textPoint(root, to, "end"));
  return range;
}

describe("response annotation text model", () => {
  it("maps a selection across bold, italic and link text to visible-text offsets", () => {
    const root = renderReply("前文 **粗体部分** 中间 *斜体* 和 [链接文字](https://example.com) 结尾");
    const model = collectAnnotatableText(root);
    expect(model.text).toBe("前文 粗体部分 中间 斜体 和 链接文字 结尾");

    const offsets = rangeToOffsets(model, selectBetween(root, "体部分", "链接"), root);
    expect(offsets).not.toBeNull();
    expect(model.text.slice(offsets!.start, offsets!.end)).toBe("体部分 中间 斜体 和 链接");

    const draft = createAnnotationDraft(model, offsets!.start, offsets!.end, "v2-3");
    expect(draft).toMatchObject({
      assistantMessageId: "v2-3",
      selectedText: "体部分 中间 斜体 和 链接",
      prefixContext: "前文 粗",
      suffixContext: "文字 结尾",
    });
    expect(draft.annotationId).toMatch(/^ann_/);
  });

  it("collects paragraphs, list items, quotes and table cells with one newline between blocks", () => {
    const root = renderReply(
      ["段一", "", "段二", "", "- 项一", "- 项二", "", "> 引用", "", "| A | B |", "|---|---|", "| 1 | 2 |"].join("\n"),
    );
    const model = collectAnnotatableText(root);
    expect(model.text).toBe("段一\n段二\n项一\n项二\n引用\nA\nB\n1\n2");

    const offsets = rangeToOffsets(model, selectBetween(root, "项二", "B"), root);
    expect(model.text.slice(offsets!.start, offsets!.end)).toBe("项二\n引用\nA\nB");
  });

  it("trims whitespace at both ends of the selection", () => {
    const root = renderReply("甲乙 丙丁 戊己");
    const model = collectAnnotatableText(root);
    const [node] = textPoint(root, "甲乙");
    const range = document.createRange();
    range.setStart(node, 2);
    range.setEnd(node, 6);
    const offsets = rangeToOffsets(model, range, root)!;
    expect(model.text.slice(offsets.start, offsets.end)).toBe("丙丁");
  });

  it("rejects selections that start, end or pass through a code block", () => {
    const root = renderReply(["说明文字", "", "```ts", "const answer = 42;", "```", "", "后续文字"].join("\n"));
    const model = collectAnnotatableText(root);
    expect(model.text).toBe("说明文字\n后续文字");
    expect(rangeToOffsets(model, selectBetween(root, "说明", "answer"), root)).toBeNull();
    expect(rangeToOffsets(model, selectBetween(root, "answer", "后续"), root)).toBeNull();
    expect(rangeToOffsets(model, selectBetween(root, "说明", "后续"), root)).toBeNull();
  });

  it("round-trips Chinese and surrogate-pair emoji through offsetsToRange", () => {
    const root = renderReply("你好👋世界🌍结束，**加粗🎉**完");
    const model = collectAnnotatableText(root);
    const start = model.text.indexOf("👋");
    const end = model.text.indexOf("完");
    const range = offsetsToRange(model, start, end);
    expect(range?.toString()).toBe("👋世界🌍结束，加粗🎉");
    expect(rangeToOffsets(model, range!, root)).toEqual({ start, end });
  });

  it("resolves annotations by offset first, then by unique context, otherwise unresolved", () => {
    const root = renderReply("第一句话。关键结论在这里。第三句话。");
    const model = collectAnnotatableText(root);
    const start = model.text.indexOf("关键结论");
    const draft = createAnnotationDraft(model, start, start + 4, "v2-1");

    expect(resolveAnnotation(model, draft)).toEqual({ status: "resolved", start, end: start + 4 });
    expect(resolveAnnotation(model, { ...draft, startOffset: 0, endOffset: 4 })).toEqual({
      status: "resolved",
      start,
      end: start + 4,
    });
    expect(resolveAnnotation(model, { ...draft, selectedText: "不存在的原文" })).toEqual({ status: "unresolved" });

    const repeated = collectAnnotatableText(renderReply("重复。重复。"));
    expect(
      resolveAnnotation(repeated, {
        selectedText: "重复",
        startOffset: 20,
        endOffset: 22,
        prefixContext: "",
        suffixContext: "。",
      }),
    ).toEqual({ status: "unresolved" });
  });

  // 聊天区 Markdown 改造（规范 §11、T26）：新增元素不能改变可批注的可见文本。
  it("excludes KaTeX output from annotatable text, so MathML and HTML copies are not counted twice", async () => {
    const view = render(<MarkdownProse content={"前文 $a^2+b^2$ 后文\n\n$$\\frac{1}{2}$$\n\n结尾"} />);
    const root = view.container.querySelector<HTMLElement>(".markdown-prose")!;
    await waitFor(() => expect(root.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2));
    const model = collectAnnotatableText(root);
    expect(model.text).toBe("前文  后文\n结尾");
    expect(model.text).not.toMatch(/[a²b]/);
    // 选区起点落在公式里：拒绝，和代码块一样。
    const range = document.createRange();
    range.setStart(textPoint(root, "前文", "start")[0], 0);
    range.setEnd(root.querySelector(".katex annotation")!.firstChild!, 1);
    expect(rangeToOffsets(model, range, root)).toBeNull();
  });

  it("collects text of whitelisted raw HTML (details, kbd) like any other element", async () => {
    const view = render(
      <MarkdownProse
        content={"按 <kbd>Esc</kbd> 退出\n\n<details>\n<summary>更多</summary>\n\n隐藏的细节\n\n</details>"}
      />,
    );
    const root = view.container.querySelector<HTMLElement>(".markdown-prose")!;
    await waitFor(() => expect(root.querySelector("details")).not.toBeNull());
    const model = collectAnnotatableText(root);
    expect(model.text).toContain("按 Esc 退出");
    // 摘要行（summary）不在可批注的块类型里，和已有行为一致：只收录段落、列表项等块里的文字。
    expect(model.text).not.toContain("更多");
    expect(model.text).toContain("隐藏的细节");
    expect(model.text).not.toContain("<kbd>");
  });

  it("does not include the callout label (it is generated by CSS)", () => {
    const root = renderReply("> [!WARNING]\n> 小心这里\n\n后文");
    const model = collectAnnotatableText(root);
    expect(model.text).toBe("小心这里\n后文");
    expect(model.text).not.toContain("注意");
  });

  it("keeps the visible text of path chips unchanged and still maps selections across them", () => {
    const root = render(
      <MarkdownProse
        content={"改了 `src/app.ts:12` 这个文件，再看 [入口](src/main.ts) 就行"}
        onOpenWorkspaceFile={() => {}}
      />,
    ).container.querySelector<HTMLElement>(".markdown-prose")!;
    expect(root.querySelector("code.md-path")).not.toBeNull();
    const model = collectAnnotatableText(root);
    expect(model.text).toBe("改了 src/app.ts:12 这个文件，再看 入口 就行");
    // 图标和第一个字符在不换行的 .md-path-lead 里，「入」「口」分属两个文本节点；选区终点落在「口」
    const offsets = rangeToOffsets(model, selectBetween(root, "app.ts", "口"), root)!;
    expect(model.text.slice(offsets.start, offsets.end)).toBe("app.ts:12 这个文件，再看 入口");
  });

  it("keeps a single newline in the model text (remark-breaks only adds <br>)", () => {
    const root = renderReply("先看日志\n再改配置\n最后重启");
    expect(root.querySelectorAll("br")).toHaveLength(2);
    const model = collectAnnotatableText(root);
    expect(model.text).toBe("先看日志\n再改配置\n最后重启");
    const offsets = rangeToOffsets(model, selectBetween(root, "日志", "配置"), root)!;
    expect(model.text.slice(offsets.start, offsets.end)).toBe("日志\n再改配置");
  });

  it("is unaffected by the streaming tail fade spans and caret", () => {
    const content = "流式中的这一句话很长很长，需要被拆成好几层渐显，还有一个光标";
    const plain = collectAnnotatableText(renderReply(content)).text;
    const view = render(
      <ReplyStreamingContext.Provider value={true}>
        <MarkdownProse content={content} />
      </ReplyStreamingContext.Provider>,
    );
    const root = view.container.querySelector<HTMLElement>(".markdown-prose")!;
    expect(root.querySelector(".md-tail")).not.toBeNull();
    expect(root.querySelector(".md-caret")).not.toBeNull();
    const model = collectAnnotatableText(root);
    expect(model.text).toBe(plain);
    const offsets = rangeToOffsets(model, selectBetween(root, "渐显", "光标"), root)!;
    expect(model.text.slice(offsets.start, offsets.end)).toBe("渐显，还有一个光标");
  });
});
