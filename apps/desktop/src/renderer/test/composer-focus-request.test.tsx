import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Composer } from "../components/Composer";
import { TooltipProvider } from "../components/ui/Tooltip";

describe("Composer focus requests", () => {
  it("focuses the textarea when the request id changes", async () => {
    const { rerender } = render(
      <TooltipProvider delayDuration={0}>
        <Composer contextSnapshot={null} focusRequestId={0} />
      </TooltipProvider>,
    );
    const input = screen.getByPlaceholderText("继续补充…");
    expect(input).not.toHaveFocus();

    rerender(
      <TooltipProvider delayDuration={0}>
        <Composer contextSnapshot={null} focusRequestId={1} />
      </TooltipProvider>,
    );

    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    expect(input).toHaveFocus();
  });
});
