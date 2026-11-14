import { describe, expect, it } from "vitest";
import {
  BLOCK_OVERHEAD,
  MESSAGE_OVERHEAD,
  estimateBlock,
  estimateContent,
  estimateItem,
  estimateMessage,
  estimateRequestInput,
  estimateText,
  estimateValue,
} from "../token-estimate";

describe("token estimate", () => {
  it("counts four characters a token for every script", () => {
    expect(estimateText("")).toBe(0);
    expect(estimateText("a")).toBe(1);
    expect(estimateText("abcdefgh")).toBe(2);
    expect(estimateText("abcdefghi")).toBe(3);
    expect(estimateText("你好世界")).toBe(1);
  });

  it("prices non-strings by their JSON text", () => {
    expect(estimateValue(null)).toBe(0);
    expect(estimateValue({ a: 1 })).toBe(estimateText('{"a":1}'));
  });

  it("adds one block overhead per item and per message block", () => {
    expect(estimateItem("abcdefgh")).toBe(2 + BLOCK_OVERHEAD);
    expect(estimateBlock({ type: "text", text: "abcdefgh" })).toBe(2 + BLOCK_OVERHEAD);
    expect(estimateBlock({ type: "tool-call", callId: "c1", name: "read", arguments: '{"path":"a"}' })).toBe(
      1 + 3 + BLOCK_OVERHEAD,
    );
    expect(
      estimateContent([
        { type: "text", text: "abcd" },
        { type: "reasoning", text: "abcd" },
      ]),
    ).toBe(2 * (1 + BLOCK_OVERHEAD));
  });

  it("adds one message overhead per message", () => {
    expect(estimateMessage("abcdefgh")).toBe(2 + BLOCK_OVERHEAD + MESSAGE_OVERHEAD);
    expect(
      estimateMessage([
        { type: "text", text: "abcd" },
        { type: "text", text: "abcd" },
      ]),
    ).toBe(2 * (1 + BLOCK_OVERHEAD) + MESSAGE_OVERHEAD);
    expect(estimateRequestInput({ messages: [{ content: "abcd" }, { content: "abcd" }], tools: ["abcd"] })).toBe(
      2 * (1 + BLOCK_OVERHEAD + MESSAGE_OVERHEAD) + 1 + BLOCK_OVERHEAD,
    );
  });
});
