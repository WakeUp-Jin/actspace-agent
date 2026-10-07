import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { setupBridge } from "./helpers/bridge";
import { createMockSession } from "../mock/mock-db";

// 会话由 setup 默认安装的 mock bridge 内存表提供（原 App 内的本地会话逻辑已移到 `mock/mock-db`）。

describe("App session copy and fork actions", () => {
  const originalClipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("copies the session id/transcript and activates an independent fork", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const bridge = setupBridge();
    createMockSession(bridge.db);
    render(<App />);

    let sourceRow: HTMLElement | null = null;
    await waitFor(() => {
      sourceRow = document.querySelector<HTMLElement>('.session-row[data-session-id^="mock-session-"]');
      expect(sourceRow).not.toBeNull();
    });
    const sourceSessionId = sourceRow?.dataset.sessionId;
    expect(sourceSessionId).toBeTruthy();

    fireEvent.contextMenu(sourceRow as HTMLElement, { clientX: 120, clientY: 80 });
    // jsdom 里元素没有尺寸，指针移向子菜单会被当成离开；用键盘打开子菜单，再直接点子菜单项。
    screen.getByRole("menuitem", { name: "复制" }).focus();
    await user.keyboard("{ArrowRight}");
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制 ID" }));
    expect(writeText).toHaveBeenLastCalledWith(sourceSessionId);
    // 等上一个菜单在 setTimeout(0) 里处理完关闭后的焦点，否则会把刚打开的菜单当成焦点移出而关掉。
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    fireEvent.contextMenu(sourceRow as HTMLElement, { clientX: 120, clientY: 80 });
    screen.getByRole("menuitem", { name: "复制" }).focus();
    await user.keyboard("{ArrowRight}");
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制会话记录" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("# New chat\n"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    fireEvent.contextMenu(sourceRow as HTMLElement, { clientX: 120, clientY: 80 });
    await user.click(screen.getByRole("menuitem", { name: "分叉" }));

    let forkRow: HTMLElement | null = null;
    await waitFor(() => {
      forkRow = Array.from(document.querySelectorAll<HTMLElement>(".session-row"))
        .find((row) => row.textContent?.includes("New chat (fork)")) ?? null;
      expect(forkRow).not.toBeNull();
    });
    expect(forkRow).not.toBeNull();
    expect(forkRow?.dataset.sessionId).not.toBe(sourceSessionId);
    expect(forkRow?.querySelector('[aria-current="page"]')).not.toBeNull();
    expect(document.querySelector(`[data-session-id="${sourceSessionId}"]`)).not.toBeNull();
  });
});
