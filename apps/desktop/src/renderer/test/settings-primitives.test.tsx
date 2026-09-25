import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SettingEditor,
  SettingLinkRow,
  SettingRow,
  SettingsSaveNoticeProvider,
  SettingsSelect,
  Toggle,
  useSettingsSaveNotice,
  useSingleEditor,
} from "../components/settings/SettingsPrimitives";

describe("SettingsPrimitives", () => {
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
    await userEvent.click(screen.getByRole("button", { name: "默认会话模型" }));
    expect(screen.getByText("Moonshot")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "模型 B" })).toBeDisabled();
    await userEvent.click(screen.getByRole("option", { name: "模型 C" }));
    expect(onChange).toHaveBeenCalledWith("c");
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
