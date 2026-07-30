import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { vi } from "vitest";
import { TooltipProvider } from "../components/ui/Tooltip";

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
