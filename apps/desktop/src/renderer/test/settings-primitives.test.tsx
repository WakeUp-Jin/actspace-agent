import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MultiSelect,
  SettingEditor,
  SettingLinkRow,
  SettingRow,
  SettingsMenuButton,
  SettingsSaveNoticeProvider,
  SettingsSelect,
  Toggle,
  useSettingsSaveNotice,
  useSingleEditor,
} from "../components/settings/SettingsPrimitives";

describe("SettingsPrimitives", () => {
  it.each(["Escape", "取消", "保存"])("returns inline editor focus after %s, including StrictMode", async (action) => {
    function Fixture() {
      const [open, setOpen] = useState(false);
      return <>
        <SettingLinkRow title="名称" ariaLabel="编辑名称" controlsId="name-editor" onClick={() => setOpen(true)} />
        {open ? <SettingEditor id="name-editor" onCancel={() => setOpen(false)} onSave={() => setOpen(false)}>
          <input autoFocus aria-label="名称输入" />
        </SettingEditor> : null}
      </>;
    }
    render(<StrictMode><Fixture /></StrictMode>);
    const trigger = screen.getByRole("button", { name: "编辑名称" });
    await userEvent.click(trigger);
    expect(screen.getByLabelText("名称输入")).toHaveFocus();
    if (action === "Escape") await userEvent.keyboard("{Escape}");
    else await userEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.queryByLabelText("名称输入")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("returns focus to a stable management button after a menu-opened editor closes", async () => {
    function Fixture() {
      const [open, setOpen] = useState(false);
      return <>
        <SettingsMenuButton id="key-management" label="管理" ariaLabel="管理密钥"
          items={[{ label: "更换密钥", onSelect: () => setOpen(true) }]} />
        {open ? <SettingEditor returnFocusId="key-management" onCancel={() => setOpen(false)} onSave={() => {}}>
          <input aria-label="新密钥" />
        </SettingEditor> : null}
      </>;
    }
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "管理密钥" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "更换密钥" }));
    await userEvent.click(screen.getByLabelText("新密钥"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("新密钥")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it.each([false, true])("restores focus after asynchronous saving without overriding another control (%s)", async (moveOutside) => {
    let finishSave!: () => void;
    function Fixture() {
      const [open, setOpen] = useState(false);
      const [saving, setSaving] = useState(false);
      return <>
        <SettingLinkRow title="名称" ariaLabel="编辑名称" controlsId="name-editor" onClick={() => setOpen(true)} />
        {open ? <SettingEditor id="name-editor" saving={saving} onCancel={() => setOpen(false)} onSave={() => {
          setSaving(true);
          finishSave = () => setOpen(false);
        }}><input autoFocus aria-label="名称输入" /></SettingEditor> : null}
        <button type="button">其他设置</button>
      </>;
    }
    render(<StrictMode><Fixture /></StrictMode>);
    const trigger = screen.getByRole("button", { name: "编辑名称" });
    const other = screen.getByRole("button", { name: "其他设置" });
    await userEvent.click(trigger);
    const save = screen.getByRole("button", { name: "保存" });
    await userEvent.click(save);
    expect(save).toBeDisabled();
    // Chromium blurs a newly disabled focused button; jsdom needs this transition explicitly.
    act(() => {
      (save as HTMLButtonElement).disabled = false;
      save.blur();
      (save as HTMLButtonElement).disabled = true;
    });
    expect(document.body).toHaveFocus();
    if (moveOutside) await userEvent.click(other);
    act(() => finishSave());
    expect(screen.queryByLabelText("名称输入")).not.toBeInTheDocument();
    await waitFor(() => expect(moveOutside ? other : trigger).toHaveFocus());
  });

  it("does not steal focus when another control closes the editor", async () => {
    function Fixture() {
      const [open, setOpen] = useState(false);
      return <>
        <SettingLinkRow title="名称" ariaLabel="编辑名称" controlsId="name-editor" onClick={() => setOpen(true)} />
        {open ? <SettingEditor id="name-editor" onCancel={() => setOpen(false)} onSave={() => {}}>
          <input autoFocus aria-label="名称输入" />
        </SettingEditor> : null}
        <button type="button" onClick={() => setOpen(false)}>转到其他设置</button>
      </>;
    }
    render(<Fixture />);
    await userEvent.click(screen.getByRole("button", { name: "编辑名称" }));
    const other = screen.getByRole("button", { name: "转到其他设置" });
    await userEvent.click(other);
    expect(screen.queryByLabelText("名称输入")).not.toBeInTheDocument();
    expect(other).toHaveFocus();
  });

  it("keeps Escape inside a saving editor and leaves IME composition intact", () => {
    const cancel = vi.fn();
    const back = vi.fn();
    const view = render(<div onKeyDown={back}>
      <SettingEditor saving onCancel={cancel} onSave={() => {}}><input aria-label="名称输入" /></SettingEditor>
    </div>);
    fireEvent.keyDown(screen.getByLabelText("名称输入"), { key: "Escape" });
    expect(cancel).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    view.rerender(<div onKeyDown={back}>
      <SettingEditor onCancel={cancel} onSave={() => {}}><input aria-label="名称输入" /></SettingEditor>
    </div>);
    fireEvent.keyDown(screen.getByLabelText("名称输入"), { key: "Escape", isComposing: true });
    expect(cancel).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it("SettingLinkRow responds to Enter and Space", async () => {
    const onClick = vi.fn();
    render(<SettingLinkRow title="显示名称" value="Jin" onClick={onClick} ariaLabel="编辑显示名称" />);
    const row = screen.getByRole("button", { name: "编辑显示名称" });
    row.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("useSingleEditor keeps only one editor open and Esc closes it", async () => {
    function Harness() {
      const editor = useSingleEditor<"a" | "b">();
      return (
        <>
          <SettingLinkRow title="A" onClick={() => editor.toggle("a")} ariaLabel="打开 A" expanded={editor.isOpen("a")} />
          {editor.isOpen("a") ? <SettingEditor onCancel={editor.close} onSave={() => {}}><input aria-label="A 输入" /></SettingEditor> : null}
          <SettingLinkRow title="B" onClick={() => editor.toggle("b")} ariaLabel="打开 B" expanded={editor.isOpen("b")} />
          {editor.isOpen("b") ? <SettingEditor onCancel={editor.close} onSave={() => {}}><input aria-label="B 输入" /></SettingEditor> : null}
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "打开 A" }));
    expect(screen.getByLabelText("A 输入")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "打开 B" }));
    expect(screen.queryByLabelText("A 输入")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 B" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByLabelText("B 输入"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("B 输入")).not.toBeInTheDocument();
  });

  it("SettingRow marks disabled rows and leaves control disabling to callers", async () => {
    const onChange = vi.fn();
    render(<SettingRow title="执行前确认" disabled control={<Toggle checked={false} disabled onChange={onChange} ariaLabel="执行前确认" />} />);
    const toggle = screen.getByRole("switch", { name: "执行前确认" });
    expect(toggle).toBeDisabled();
    expect(toggle.closest("[aria-disabled='true']")).not.toBeNull();
    await userEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("SettingsSelect renders groups, skips disabled options and reports the choice", async () => {
    const onChange = vi.fn();
    render(
      <SettingsSelect
        ariaLabel="默认会话模型"
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "模型 A", group: "DeepSeek" },
          { value: "b", label: "模型 B", group: "DeepSeek", disabled: true },
          { value: "c", label: "模型 C", group: "Moonshot" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "默认会话模型" }));
    expect(screen.getByText("Moonshot")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "模型 B" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("option", { name: "模型 C" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("MultiSelect toggles options and stays open until Escape", async () => {
    const onChange = vi.fn();
    function Fixture() {
      const [values, setValues] = useState<string[]>(["a"]);
      return <MultiSelect ariaLabel="搜索来源" values={values} onChange={(next) => { onChange(next); setValues(next); }}
        options={[{ value: "a", label: "网页" }, { value: "b", label: "新闻" }, { value: "c", label: "论文", disabled: true }]} />;
    }
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "搜索来源" });
    expect(trigger).toHaveTextContent("网页");
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitemcheckbox", { name: "网页" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: "论文" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "新闻" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "网页" }));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
    expect(screen.getByRole("menu", { name: "搜索来源" })).toBeInTheDocument();
    expect(trigger).toHaveTextContent("新闻");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("SettingsMenuButton runs the chosen action and skips disabled items", async () => {
    const remove = vi.fn(); const rename = vi.fn();
    render(<SettingsMenuButton label="管理" ariaLabel="管理连接" items={[{ label: "重命名", onSelect: rename, disabled: true }, { label: "删除", onSelect: remove, danger: true }]} />);
    await userEvent.click(screen.getByRole("button", { name: "管理连接" }));
    expect(screen.getByRole("menuitem", { name: "重命名" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    expect(rename).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("save notice shows 已保存 in a status region", async () => {
    vi.useFakeTimers();
    function Trigger() {
      const notify = useSettingsSaveNotice();
      return <button type="button" onClick={() => notify()}>保存</button>;
    }
    render(<SettingsSaveNoticeProvider><Trigger /></SettingsSaveNoticeProvider>);
    act(() => screen.getByRole("button", { name: "保存" }).click());
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole("status")).toHaveTextContent("");
    vi.useRealTimers();
  });
});
