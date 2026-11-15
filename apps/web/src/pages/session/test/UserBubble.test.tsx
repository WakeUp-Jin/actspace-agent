import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { UserBubble, userBubbleText } from "../blocks/UserBubble";

type UserBlock = Extract<MessageBlock, { kind: "user" }>;
const user = (partial: Partial<UserBlock>): UserBlock => ({ kind: "user", id: "u", content: "", createdAt: "2026-11-15T00:00:00.000Z", ...partial } as UserBlock);

describe("UserBubble", () => {
  it("labels a bubble that sent only annotations or attachments instead of drawing it empty", () => {
    expect(userBubbleText(user({ responseAnnotations: [{}, {}] as unknown as UserBlock["responseAnnotations"] }))).toBe("2 条批注");
    expect(userBubbleText(user({ attachments: [{}] as unknown as UserBlock["attachments"] }))).toBe("1 个附件");
    expect(userBubbleText(user({ content: "你好", responseAnnotations: [{}] as unknown as UserBlock["responseAnnotations"] }))).toBe("你好");
  });

  it("styles the count label as meta text", () => {
    render(<UserBubble block={user({ responseAnnotations: [{}] as unknown as UserBlock["responseAnnotations"] })} />);
    expect(screen.getByText("1 条批注")).toHaveClass("user-bubble-meta");
  });
});
