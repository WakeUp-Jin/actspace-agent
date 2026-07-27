import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { GeneratedImageBlock } from "../components/messages/GeneratedImageBlock";
import { RightPanelProvider, useRightPanel } from "../components/right-panel/RightPanelContext";

const message: Extract<MessageBlock, { kind: "image_generation" }> = {
  kind: "image_generation",
  id: "evt-image",
  status: "completed",
  promptPreview: "A serene koi pond",
  requestedCount: 2,
  generatedCount: 2,
  model: "gpt-image-2",
  size: "1024x1024",
  displayText: "Generated 2 images",
  images: [
    { type: "image", name: "generated-01.png", path: "/tmp/session/generated-01.png", mimeType: "image/png" },
    { type: "image", name: "generated-02.png", path: "/tmp/session/generated-02.png", mimeType: "image/png" },
  ],
  createdAt: "2026-07-27T15:00:00.000Z",
};

function ActiveTabProbe() {
  const { activeTab } = useRightPanel();
  return <div data-testid="active-image-src">{activeTab?.kind === "image" ? activeTab.src : ""}</div>;
}

function renderBlock() {
  return render(
    <RightPanelProvider>
      <GeneratedImageBlock message={message} />
      <ActiveTabProbe />
    </RightPanelProvider>,
  );
}

describe("GeneratedImageBlock", () => {
  it("renders local artifacts and opens a clicked image in the right panel", async () => {
    renderBlock();
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "file:///tmp/session/generated-01.png");

    await userEvent.click(screen.getByRole("button", { name: "查看 generated-01.png" }));
    expect(screen.getByTestId("active-image-src")).toHaveTextContent("file:///tmp/session/generated-01.png");
  });

  it("shows a local load failure instead of keeping a broken thumbnail", () => {
    renderBlock();
    fireEvent.error(screen.getAllByRole("img")[0]);
    expect(screen.getByText("本地图片加载失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "generated-01.png 加载失败" })).toBeDisabled();
  });
});
