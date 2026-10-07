import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../components/Composer";
import type { MessageQueueControls } from "../components/composer/MessageQueueTray";
import { TooltipProvider } from "../components/ui/Tooltip";
import type { SessionMessageQueue } from "../session/message-queue";

function controls(queue: SessionMessageQueue): MessageQueueControls {
  return {
    queue, running: true, steerBlockedReason: null,
    onSteer: vi.fn(), onUnsteer: vi.fn(), onRemove: vi.fn(), onMoveUp: vi.fn(), onEdit: vi.fn(), onResume: vi.fn(),
  };
}

function renderWithQueue(queue: SessionMessageQueue) {
  return render(
    <TooltipProvider delayDuration={0}>
      <Composer contextSnapshot={null} isStreaming messageQueue={controls(queue)} />
    </TooltipProvider>,
  );
}

describe("message queue tray position", () => {
  it("sits outside the composer panel, right before it", () => {
    const { container } = renderWithQueue({
      paused: false,
      steering: [],
      items: [{ id: "a", kind: "message", text: "把测试也补上", options: {} }],
    });
    const tray = screen.getByRole("region", { name: "消息队列" });
    const panel = container.querySelector(".composer-panel") as HTMLElement;

    expect(panel).not.toContainElement(tray);
    expect(tray.nextElementSibling).toBe(panel);
    expect(tray.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders nothing for an empty queue", () => {
    const { container } = renderWithQueue({ paused: false, steering: [], items: [] });
    expect(screen.queryByRole("region", { name: "消息队列" })).toBeNull();
    expect(container.querySelector(".composer-message-queue")).toBeNull();
  });
});
