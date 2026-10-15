import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { TooltipProvider } from "../components/ui/Tooltip";
import { resetBridge, setupBridge } from "./helpers/bridge";

vi.mock("@testing-library/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@testing-library/react")>();

  return {
    ...actual,
    render: (ui: React.ReactElement, options?: Parameters<typeof actual.render>[1]) => {
      const UserWrapper = options?.wrapper;

      function Wrapper({ children }: { children: React.ReactNode }) {
        const wrappedChildren = UserWrapper
          ? React.createElement(UserWrapper, null, children)
          : children;

        return React.createElement(
          TooltipProvider,
          { delayDuration: 0, skipDelayDuration: 0, children: wrappedChildren },
        );
      }

      return actual.render(ui, { ...options, wrapper: Wrapper });
    },
  };
});

// 每个 renderer 用例默认装一个完整的 mock bridge，用例里用 `setupBridge(overrides)` 替换。
// 本文件同时被 node 环境的 main 进程测试加载，那里没有 window。
if (typeof window !== "undefined") {
  beforeEach(() => { setupBridge(); });
  afterEach(() => {
    resetBridge();
    // 14 T20：所有会话的未确认提交都存 localStorage，用例之间不能互相影响。
    for (const key of Object.keys(localStorage)) if (key.startsWith("actspace:pending-submission:")) localStorage.removeItem(key);
    // 侧栏视图选项和折叠状态也存 localStorage。
    localStorage.removeItem("actspace.sidebar.view.v1");
  });
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

// jsdom 不实现布局，所以没有 scrollIntoView。凡是「把命中滚进可见区」这类代码
// 在测试里都会抛 TypeError，补一个空实现即可（滚动本身不属于单测的验收范围）。
// 本文件同时被 node 环境的 main 进程测试加载，那里没有 Element，必须先探测。
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Radix 的 Select、DropdownMenu、ContextMenu 在 pointerdown 时调用 hasPointerCapture / releasePointerCapture，
// 并用 PointerEvent 区分鼠标与触摸。jsdom 没有这些，缺了会在打开时抛 TypeError。
if (typeof window !== "undefined") {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  }
  const proto = window.HTMLElement.prototype;
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
}
