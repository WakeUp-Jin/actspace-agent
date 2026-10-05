import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const terminalMocks = vi.hoisted(() => ({
  listener: undefined as ((event: Record<string, unknown>) => void) | undefined,
  write: vi.fn(),
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    loadAddon() {}
    open() {}
    onData() { return { dispose() {} }; }
    attachCustomKeyEventHandler() {}
    focus() {}
    dispose() {}
    hasSelection() { return false; }
    getSelection() { return ""; }
    write = terminalMocks.write;
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

import { TerminalRenderView } from "../components/right-panel/TerminalRenderView";
import { setupBridge } from "./helpers/bridge";

describe("TerminalRenderView chrome", () => {
  beforeEach(() => {
    terminalMocks.listener = undefined;
    terminalMocks.write.mockClear();
    setupBridge({
      "events.terminal": vi.fn((listener) => {
        terminalMocks.listener = listener as (event: Record<string, unknown>) => void;
        return () => undefined;
      }),
      "terminal.attach": vi.fn(async () => ({
        ok: true as const,
        terminal: {
          id: "terminal-1",
          sessionId: "session-1",
          shellName: "zsh",
          status: "running" as const,
          createdAt: new Date().toISOString(),
        },
      })),
      "terminal.resize": vi.fn(async () => ({ ok: true as const })),
      "terminal.ack": vi.fn(async () => ({ ok: true as const })),
      "terminal.detach": vi.fn(async () => ({ ok: true as const })),
    });
  });

  it("hides the decorative bottom scrollbar and only shows status chrome after exit", async () => {
    render(
      <TerminalRenderView
        terminalId="terminal-1"
        sessionId="session-1"
        shellName="zsh"
        onRestart={vi.fn()}
      />,
    );

    const terminalRegion = screen.getByRole("region", { name: "终端 zsh" });
    expect(terminalRegion.firstElementChild).toHaveClass("[&_.scrollbar.horizontal]:hidden");
    expect(screen.queryByText("running")).not.toBeInTheDocument();
    await waitFor(() => expect(terminalMocks.listener).toBeTypeOf("function"));

    act(() => {
      terminalMocks.listener?.({
        type: "exit",
        terminalId: "terminal-1",
        exitCode: 0,
      });
    });

    expect(screen.getByText("已退出")).toHaveAttribute("data-terminal-status", "exited");
    expect(screen.getByRole("button", { name: "重启" })).toBeInTheDocument();
  });
});
