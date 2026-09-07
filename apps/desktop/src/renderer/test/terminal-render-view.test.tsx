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

describe("TerminalRenderView chrome", () => {
  beforeEach(() => {
    terminalMocks.listener = undefined;
    terminalMocks.write.mockClear();
    window.actspace = {
      onTerminalEvent: vi.fn((listener) => {
        terminalMocks.listener = listener as (event: Record<string, unknown>) => void;
        return () => undefined;
      }),
      attachTerminal: vi.fn(async () => ({
        ok: true as const,
        terminal: {
          id: "terminal-1",
          sessionId: "session-1",
          shellName: "zsh",
          status: "running" as const,
          createdAt: new Date().toISOString(),
        },
      })),
      resizeTerminal: vi.fn(async () => ({ ok: true as const })),
      ackTerminal: vi.fn(async () => ({ ok: true as const })),
      detachTerminal: vi.fn(async () => ({ ok: true as const })),
    } as unknown as Window["actspace"];
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

    expect(screen.getByText("exited")).toHaveAttribute("data-terminal-status", "exited");
    expect(screen.getByRole("button", { name: "重启" })).toBeInTheDocument();
  });
});
