import { act, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { UserMessage } from "../components/messages/UserMessage";
import { ResponseAnnotationContext, type ResponseAnnotationContextValue } from "../components/messages/response-annotation-context";
import { makeAnnotation } from "./fixtures/response-annotation-helpers";

function makeUserBlock(content: string): Extract<MessageBlock, { kind: "user" }> {
  return {
    kind: "user",
    id: "user-1",
    content,
    createdAt: "2026-07-05T00:00:00.000Z",
  };
}

const LONG_CONTENT = Array.from({ length: 200 }, (_, i) => `第 ${i} 行超长输入`).join("\n");
const originalBridge = Object.getOwnPropertyDescriptor(window, "actspace");

// jsdom 不做真实布局，scrollHeight 恒为 0；用原型 getter 模拟内容完整高度。
function mockScrollHeight(value: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  if (originalBridge) Object.defineProperty(window, "actspace", originalBridge);
  else Reflect.deleteProperty(window, "actspace");
});

describe("UserMessage", () => {
  it.each([
    { name: "omitted attachments", attachments: undefined },
    { name: "empty attachments", attachments: [] },
  ])("settles pure-text rendering with desktop IPC and $name", async ({ attachments }) => {
    const readSessionArtifact = vi.fn();
    Object.defineProperty(window, "actspace", { configurable: true, value: { readSessionArtifact } });
    let commits = 0;
    const onRender = () => {
      commits += 1;
      // Stop the unfixed feedback loop so the regression fails without hanging the suite.
      if (commits === 20) Object.defineProperty(window, "actspace", { configurable: true, value: {} });
    };
    render(
      <Profiler id="plain-message" onRender={onRender}>
        <UserMessage message={{ ...makeUserBlock("纯文本发送"), attachments }} sessionId="session-1" />
      </Profiler>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(readSessionArtifact).not.toHaveBeenCalled();
    expect(commits).toBeLessThanOrEqual(2);
    const settledCommits = commits;
    await act(async () => { await Promise.resolve(); });
    expect(commits).toBe(settledCommits);
  });

  it("renders short content without collapse interaction", () => {
    mockScrollHeight(40);
    render(<UserMessage message={makeUserBlock("短消息")} />);

    const content = screen.getByText("短消息");
    expect(content.className).toContain("overflow-y-auto");
    expect(content.className).not.toContain("cursor-pointer");
    expect(content).not.toHaveAttribute("aria-expanded");
    expect(document.querySelector(".user-content-fade")).toBeNull();
  });

  it("collapses long content by default with a fade and no scrollbar", () => {
    mockScrollHeight(600);
    render(<UserMessage message={makeUserBlock(LONG_CONTENT)} />);

    const content = screen.getByText(/第 0 行超长输入/);
    expect(content.className).toContain("overflow-hidden");
    expect(content.className).toContain("cursor-pointer");
    expect(content).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".user-content-fade")).not.toBeNull();
  });

  it("expands on click and stays expanded when clicking the card again", async () => {
    const user = userEvent.setup();
    mockScrollHeight(600);
    render(<UserMessage message={makeUserBlock(LONG_CONTENT)} />);

    const content = screen.getByText(/第 0 行超长输入/);
    await user.click(content);

    expect(content.className).toContain("overflow-y-auto");
    expect(content.className).toContain("max-h-");
    expect(content).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".user-content-fade")).toBeNull();

    // 再点卡片不收起——收起只通过点击卡片外部触发
    await user.click(content);
    expect(content).toHaveAttribute("aria-expanded", "true");
    expect(content.className).toContain("overflow-y-auto");
  });

  it("collapses only when clicking outside the card", async () => {
    const user = userEvent.setup();
    mockScrollHeight(600);
    render(
      <div>
        <UserMessage message={makeUserBlock(LONG_CONTENT)} />
        <button type="button">elsewhere</button>
      </div>,
    );

    const content = screen.getByText(/第 0 行超长输入/);
    await user.click(content);
    expect(content).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(content).toHaveAttribute("aria-expanded", "false");
    expect(content.className).toContain("overflow-hidden");
  });

  it("opens a sent image attachment through the provided preview action", async () => {
    const user = userEvent.setup();
    const onOpenAttachmentPreview = vi.fn();
    const attachment = {
      id: "attachment-1",
      kind: "image" as const,
      name: "reference.png",
      path: "/tmp/reference.png",
      mimeType: "image/png",
      previewUrl: "data:image/png;base64,preview",
    };

    render(
      <UserMessage
        message={{ ...makeUserBlock("看看这张图"), attachments: [attachment] }}
        onOpenAttachmentPreview={onOpenAttachmentPreview}
      />,
    );

    const previewButton = screen.getByRole("button", { name: "Preview message image reference.png" });
    expect(previewButton).toHaveStyle({ backgroundImage: 'url("data:image/png;base64,preview")' });

    await user.click(previewButton);
    expect(onOpenAttachmentPreview).toHaveBeenCalledWith(attachment);
  });

  it("hydrates a persisted image attachment from the session artifact store", async () => {
    const readSessionArtifact = vi.fn(async () => ({
      name: "reference.png",
      relativePath: "attachment-1",
      mimeType: "image/png" as const,
      size: 68,
      dataUrl: "data:image/png;base64,persisted",
    }));
    const onOpenAttachmentPreview = vi.fn();
    Object.defineProperty(window, "actspace", {
      configurable: true,
      value: { readSessionArtifact },
    });

    const attachment = {
      id: "attachment-1",
      path: "attachment-1",
      kind: "image" as const,
      name: "reference.png",
      mimeType: "image/png",
    };
    render(
      <UserMessage
        message={{ ...makeUserBlock("看看这张图"), attachments: [attachment] }}
        sessionId="session-1"
        onOpenAttachmentPreview={onOpenAttachmentPreview}
      />,
    );

    const previewButton = await screen.findByRole("button", { name: "Preview message image reference.png" });
    expect(readSessionArtifact).toHaveBeenCalledWith({ sessionId: "session-1", artifactPath: "attachment-1" });
    expect(previewButton).toHaveStyle({ backgroundImage: 'url("data:image/png;base64,persisted")' });
    expect(previewButton).not.toBeDisabled();

    await userEvent.click(previewButton);
    expect(onOpenAttachmentPreview).toHaveBeenCalledWith(expect.objectContaining({ previewUrl: "data:image/png;base64,persisted" }));
  });
});

describe("UserMessage response annotation summary", () => {
  function contextWith(overrides: Partial<ResponseAnnotationContextValue> = {}): ResponseAnnotationContextValue {
    return {
      sentByMessageId: new Map(),
      canAnnotate: () => true,
      onAddAnnotation: vi.fn(),
      onCopyToDraft: vi.fn(),
      activeAnnotationId: null,
      setActiveAnnotationId: vi.fn(),
      reportResolution: vi.fn(),
      isAnnotationAvailable: () => true,
      locateAnnotation: vi.fn(),
      ...overrides,
    };
  }

  const annotated = {
    ...makeUserBlock("请解释"),
    responseAnnotations: [
      makeAnnotation({ annotationId: "a", comment: "为什么这样" }),
      makeAnnotation({ annotationId: "b", assistantMessageId: "v2-9", selectedText: "<b>不是标签</b>" }),
    ],
  };

  it("collapses to a count and expands to the excerpts and comments as plain text", async () => {
    render(
      <ResponseAnnotationContext.Provider value={contextWith()}>
        <UserMessage message={annotated} sessionId="session-1" />
      </ResponseAnnotationContext.Provider>,
    );
    const toggle = screen.getByRole("button", { name: /2 条回复引用/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "回复引用" })).toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "回复引用" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("为什么这样")).toBeVisible();
    expect(screen.getByText("<b>不是标签</b>")).toBeVisible();
    expect(list.querySelector("b")).toBeNull();
  });

  it("locates an available annotation and marks unavailable ones", async () => {
    const locateAnnotation = vi.fn();
    render(
      <ResponseAnnotationContext.Provider value={contextWith({ locateAnnotation, isAnnotationAvailable: (annotation) => annotation.annotationId === "a" })}>
        <UserMessage message={annotated} sessionId="session-1" />
      </ResponseAnnotationContext.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /2 条回复引用/ }));
    const locateButtons = screen.getAllByRole("button", { name: "定位" });
    expect(locateButtons).toHaveLength(1);
    expect(screen.getByText("原回复不可用")).toBeVisible();
    await userEvent.click(locateButtons[0]!);
    expect(locateAnnotation).toHaveBeenCalledWith(expect.objectContaining({ annotationId: "a" }));
  });

  it("treats every annotation as unavailable without a provider and renders nothing without annotations", async () => {
    const { rerender } = render(<UserMessage message={annotated} sessionId="session-1" />);
    await userEvent.click(screen.getByRole("button", { name: /2 条回复引用/ }));
    expect(screen.getAllByText("原回复不可用")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "定位" })).toBeNull();
    rerender(<UserMessage message={makeUserBlock("普通消息")} sessionId="session-1" />);
    expect(screen.queryByRole("button", { name: /条回复引用/ })).toBeNull();
  });
});
