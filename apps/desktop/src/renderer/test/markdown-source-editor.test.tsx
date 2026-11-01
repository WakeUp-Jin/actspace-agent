import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownSourceEditor } from "../components/right-panel/docs/MarkdownSourceEditor";

function Harness({ initial = "ab", readOnly = false, onSave }: { initial?: string; readOnly?: boolean; onSave: () => void }) {
  const [value, setValue] = useState(initial);
  return <MarkdownSourceEditor value={value} onChange={setValue} onSave={onSave} readOnly={readOnly} />;
}

describe("MarkdownSourceEditor", () => {
  it("原生 textarea 直接编辑", async () => {
    const user = userEvent.setup();
    render(<Harness onSave={() => undefined} />);
    const editor = screen.getByRole("textbox", { name: "Markdown 源码" }) as HTMLTextAreaElement;
    expect(editor.tagName).toBe("TEXTAREA");
    await user.type(editor, "c");
    expect(editor.value).toBe("abc");
  });

  it("Tab 在光标处插入两个空格，不把焦点移走", async () => {
    const user = userEvent.setup();
    render(<Harness onSave={() => undefined} />);
    const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(1, 1);
    await user.keyboard("{Tab}");
    expect(editor.value).toBe("a  b");
    expect(editor).toHaveFocus();
  });

  it("⌘S 与 Ctrl+S 都触发保存", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    const editor = screen.getByRole("textbox");
    fireEvent.keyDown(editor, { key: "s", metaKey: true });
    fireEvent.keyDown(editor, { key: "S", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("只读时不能编辑也不触发保存", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness onSave={onSave} readOnly />);
    const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(editor, "zzz");
    fireEvent.keyDown(editor, { key: "s", metaKey: true });
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(editor.value).toBe("ab");
    expect(onSave).not.toHaveBeenCalled();
  });
});
