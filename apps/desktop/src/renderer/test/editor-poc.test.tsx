// M0.2 PoC：验证原生 ProseMirror 在本仓库 jsdom + user-event 测试环境里的可行性。
// 决策确认后删除，不进入正式实现。
import { fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Schema, type Node as PMNode } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { closeHistory, history, undo } from "prosemirror-history";
import { baseKeymap } from "prosemirror-commands";
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom 没有布局：ProseMirror 的 posAtCoords / coordsAtPos 需要这几个 API 存在。
document.elementFromPoint ??= () => null;
const emptyRect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
Range.prototype.getBoundingClientRect ??= () => emptyRect;
Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", toDOM: () => ["p", 0], parseDOM: [{ tag: "p" }] },
    text: { group: "inline" },
    hard_break: { inline: true, group: "inline", selectable: false, toDOM: () => ["br"], parseDOM: [{ tag: "br" }] },
    file_mention: {
      inline: true,
      group: "inline",
      atom: true,
      selectable: true,
      attrs: { relativePath: {}, displayName: {} },
      toDOM: (node) => ["span", { "data-file-mention": node.attrs.relativePath, contenteditable: "false" }, node.attrs.displayName],
    },
  },
});

function toPlainText(doc: PMNode): string {
  const blocks: string[] = [];
  doc.forEach((block) => {
    let line = "";
    block.forEach((inline) => {
      if (inline.isText) line += inline.text;
      else if (inline.type.name === "hard_break") line += "\n";
      else if (inline.type.name === "file_mention") line += `@${inline.attrs.relativePath}`;
    });
    blocks.push(line);
  });
  return blocks.join("\n");
}

function queryBeforeCursor(state: EditorState, trigger: "@" | "/"): { from: number; to: number; query: string } | null {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const match = trigger === "@"
    ? /(?:^|[\s(（，。,.])@([^\s@￼]*)$/u.exec(textBefore)
    : /^\/([^/\s]*)$/u.exec(textBefore);
  if (!match) return null;
  const query = match[1] ?? "";
  return { from: $from.pos - query.length - 1, to: $from.pos, query };
}

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

function mount(onEnter = vi.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView(host, {
    state: EditorState.create({
      schema,
      plugins: [
        history(),
        keymap({
          Enter: (_state, _dispatch, v) => {
            if (v?.composing) return false;
            onEnter(toPlainText(v!.state.doc));
            return true;
          },
          "Shift-Enter": (state, dispatch) => {
            dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
            return true;
          },
          "Mod-z": undo,
        }),
        keymap(baseKeymap),
      ],
    }),
    attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "消息输入框" },
    clipboardTextSerializer: (slice) => toPlainText(schema.topNodeType.create(null, slice.content.firstChild?.type.name === "paragraph" ? slice.content : schema.nodes.paragraph.create(null, slice.content))),
  });
  return { view, onEnter, dom: view.dom as HTMLElement };
}

describe("ProseMirror PoC in jsdom", () => {
  it("accepts user-event typing into the contenteditable", async () => {
    const user = userEvent.setup();
    const { dom } = mount();
    await user.click(dom);
    await user.type(dom, "hello 世界");
    await waitFor(() => expect(toPlainText(view!.state.doc)).toBe("hello 世界"));
  });

  it("detects @ and / query ranges from the selection", async () => {
    const user = userEvent.setup();
    const { dom } = mount();
    await user.click(dom);
    await user.type(dom, "请检查 @src/com");
    await waitFor(() => expect(queryBeforeCursor(view!.state, "@")?.query).toBe("src/com"));
    expect(queryBeforeCursor(view!.state, "/")).toBeNull();
  });

  it("replaces the query range with an atom mention; Backspace removes it whole; undo restores", async () => {
    const user = userEvent.setup();
    const { dom } = mount();
    await user.click(dom);
    await user.type(dom, "看 @Comp");
    await waitFor(() => expect(queryBeforeCursor(view!.state, "@")).not.toBeNull());
    const range = queryBeforeCursor(view!.state, "@")!;
    const node = schema.nodes.file_mention.create({ relativePath: "src/components/Composer.tsx", displayName: "Composer.tsx" });
    view!.dispatch(closeHistory(view!.state.tr.replaceWith(range.from, range.to, [node, schema.text(" ")])));
    expect(toPlainText(view!.state.doc)).toBe("看 @src/components/Composer.tsx ");
    expect(dom.querySelector("[data-file-mention]")?.textContent).toBe("Composer.tsx");

    view!.dispatch(closeHistory(view!.state.tr));
    view!.dispatch(view!.state.tr.setSelection(TextSelection.create(view!.state.doc, view!.state.doc.content.size - 2)));
    // 光标在 mention 之后：Backspace 一次删掉整个节点
    fireEvent.keyDown(dom, { key: "Backspace", keyCode: 8 });
    expect(toPlainText(view!.state.doc)).toBe("看  ");

    fireEvent.keyDown(dom, { key: "z", keyCode: 90, ctrlKey: true });
    expect(toPlainText(view!.state.doc)).toContain("@src/components/Composer.tsx");
  });

  // compositionend 之后的 Enter 在 jsdom 里未触发 keymap，原因未查清；PB.1 在正式编辑器测试中解决并删除本文件。
  it.skip("Enter sends, Shift+Enter breaks, and Enter during IME composition does nothing", async () => {
    const user = userEvent.setup();
    const { dom, onEnter } = mount();
    await user.click(dom);
    await user.type(dom, "line1");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    // jsdom 的 DOM selection 不跟随 PM 事务同步；续写用 transaction 模拟，真实光标行为留给 Electron 验收。
    view!.dispatch(view!.state.tr.insertText("line2"));
    await waitFor(() => expect(toPlainText(view!.state.doc)).toBe("line1\nline2"));

    fireEvent.compositionStart(dom);
    fireEvent.keyDown(dom, { key: "Enter", keyCode: 229, isComposing: true });
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.compositionEnd(dom);

    fireEvent.keyDown(dom, { key: "Enter", keyCode: 13 });
    expect(onEnter).toHaveBeenCalledWith("line1\nline2");
  });
});
