import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

describe("App session copy and fork actions", () => {
  const originalClipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;

  afterEach(() => {
    delete (window as unknown as { actspace?: unknown }).actspace;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("copies the local session id/transcript and activates an independent fork", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "New Agent" }));

    let sourceRow: HTMLElement | null = null;
    await waitFor(() => {
      sourceRow = document.querySelector<HTMLElement>('.session-row[data-session-id^="local-session-"]');
      expect(sourceRow).not.toBeNull();
    });
    const sourceSessionId = sourceRow?.dataset.sessionId;
    expect(sourceSessionId).toBeTruthy();

    fireEvent.contextMenu(sourceRow as HTMLElement, { clientX: 120, clientY: 80 });
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy ID" }));
    expect(writeText).toHaveBeenLastCalledWith(sourceSessionId);

    fireEvent.contextMenu(sourceRow as HTMLElement, { clientX: 120, clientY: 80 });
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy Transcript" }));
    expect(writeText).toHaveBeenLastCalledWith("# New chat\n");

    fireEvent.contextMenu(sourceRow as HTMLElement, { clientX: 120, clientY: 80 });
    await user.click(screen.getByRole("menuitem", { name: "Fork" }));

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
