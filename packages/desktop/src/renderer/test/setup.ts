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
