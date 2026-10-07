import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SettingsNav } from "../components/settings/SettingsNav";
import { StatusDot, Toggle, type StatusTone } from "../components/settings/SettingsPrimitives";

describe("Settings semantics", () => {
  it("marks only the active section in the settings navigation", () => {
    const onSelect = vi.fn();
    render(<SettingsNav active="usage" onSelect={onSelect} onBack={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "设置导航" });

    expect(screen.getByRole("button", { name: "使用统计" })).toHaveAttribute("aria-current", "page");
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    expect(onSelect).toHaveBeenCalledWith("update");
  });

  it("exposes the toggle as a switch whose checked state follows clicks", () => {
    function ControlledToggle() {
      const [checked, setChecked] = useState(false);
      return <Toggle checked={checked} onChange={setChecked} ariaLabel="执行前确认" />;
    }
    render(<ControlledToggle />);
    const toggle = screen.getByRole("switch", { name: "执行前确认" });

    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("exposes the status tone on the status dot", () => {
    const tones: StatusTone[] = ["ok", "off", "warn", "error", "neutral"];
    render(
      <>
        {tones.map((tone) => (
          <StatusDot key={tone} tone={tone}>
            {`状态 ${tone}`}
          </StatusDot>
        ))}
      </>,
    );

    for (const tone of tones) {
      expect(screen.getByText(`状态 ${tone}`).querySelector("[data-state]")).toHaveAttribute("data-state", tone);
    }
  });
});
