import { render, screen } from "@testing-library/react";
import { connectionWrapper, fakeClient, fakeConnection, FakeConnectionStore } from "../../../test/helpers/fake-session";
import { BashRow } from "../blocks/BashRow";

const at = "2026-11-04T00:00:00.000Z";
const block = (overrides: Record<string, unknown> = {}) =>
  ({
    status: "success",
    command: "pnpm test",
    title: "Bash command",
    createdAt: at,
    sandboxed: true,
    exitCode: 0,
    ...overrides,
  }) as Parameters<typeof BashRow>[0]["block"];
const show = (b: Parameters<typeof BashRow>[0]["block"]) =>
  render(<BashRow block={b} sessionId="s1" />, {
    wrapper: connectionWrapper(new FakeConnectionStore(fakeConnection(fakeClient(() => null)))),
  });

describe("BashRow environment badge", () => {
  it.each(["pending", "running"])("shows the sandbox badge while the command is %s", (status) => {
    show(block({ status, exitCode: undefined }));
    expect(screen.getByText("沙盒")).toBeInTheDocument();
  });

  it.each(["success", "failed", "denied", "expired", "cancelled"])(
    "hides the sandbox badge once the command is %s",
    (status) => {
      show(block({ status, exitCode: status === "success" ? 0 : 1 }));
      expect(screen.queryByText("沙盒")).not.toBeInTheDocument();
    },
  );

  it("hides the real-environment badge after the command ends but keeps the not-executed badge", () => {
    const running = show(block({ sandboxed: false, status: "running" }));
    expect(screen.getByText("真实环境")).toBeInTheDocument();
    running.unmount();
    const real = show(block({ sandboxed: false }));
    expect(screen.queryByText("真实环境")).toBeNull();
    real.unmount();
    show(block({ status: "denied", notExecuted: true }));
    expect(screen.getByText("未执行")).toBeInTheDocument();
  });
});
