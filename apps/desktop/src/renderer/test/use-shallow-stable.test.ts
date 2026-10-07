import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useShallowStable } from "../hooks/useShallowStable";

// 14 收尾：Context value 改用 useShallowStable 后，字段不变时引用必须保持不变，否则消费方会随每次渲染重渲染。
describe("useShallowStable", () => {
  it("keeps the previous object while every field is identical", () => {
    const onSend = () => {};
    const messages = [{ id: "m1" }];
    const { result, rerender } = renderHook((props) => useShallowStable(props), { initialProps: { messages, onSend, count: 1 } });
    const first = result.current;
    rerender({ messages, onSend, count: 1 });
    expect(result.current).toBe(first);
  });

  it("returns the new object when a field changes, is added or is removed", () => {
    const messages = [{ id: "m1" }];
    const { result, rerender } = renderHook((props: Record<string, unknown>) => useShallowStable(props), { initialProps: { messages, count: 1 } as Record<string, unknown> });
    const changed = { messages: [...messages], count: 1 };
    rerender(changed);
    expect(result.current).toBe(changed);
    const added = { ...changed, extra: undefined };
    rerender(added);
    expect(result.current).toBe(added);
    const removed = { messages: changed.messages };
    rerender(removed);
    expect(result.current).toBe(removed);
  });
});
