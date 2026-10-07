import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { TerminalSessionSnapshot } from "@actspace/shared";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";
import { useOpenTerminal } from "../components/right-panel/useOpenTerminal";
import { setupBridge } from "./helpers/bridge";

vi.mock("../components/right-panel/terminal-render-loader", () => ({
  preloadTerminalRenderView: vi.fn(async () => ({})),
}));

it("shows the same default title after creation and restore without changing host data", async () => {
  const terminal: TerminalSessionSnapshot = {
    id: "terminal-1", sessionId: "session-1", title: "Terminal 1", shellName: "zsh",
    status: "running", createdAt: "2026-09-08T00:00:00.000Z",
  } as TerminalSessionSnapshot;
  setupBridge({
    "terminal.create": vi.fn(async () => ({ ok: true, terminal })),
  });
  const { result } = renderHook(() => ({ panel: useRightPanel(), start: useOpenTerminal("session-1") }), {
    wrapper: RightPanelProvider,
  });
  await act(async () => { await result.current.start.openTerminal(); });
  expect(result.current.panel.tabs[0]?.title).toBe("终端 1");
  act(() => { result.current.panel.syncTerminalTabs("session-1", []); });
  act(() => { result.current.panel.syncTerminalTabs("session-1", [terminal]); });
  expect(result.current.panel.tabs[0]?.title).toBe("终端 1");
  expect(terminal.title).toBe("Terminal 1");
  act(() => { result.current.panel.syncTerminalTabs("session-1", [{ ...terminal, id: "terminal-2", title: "build output" }]); });
  expect(result.current.panel.tabs[0]?.title).toBe("build output");
});
