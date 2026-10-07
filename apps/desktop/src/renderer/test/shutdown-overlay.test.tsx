import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { AppShutdownNotice } from "@actspace/shared";
import { ShutdownOverlay } from "../components/ShutdownOverlay";
import { setupBridge } from "./helpers/bridge";

describe("ShutdownOverlay", () => {
  it("默认不渲染遮罩；收到 onShuttingDown 回调后出现", () => {
    let fire: ((notice: AppShutdownNotice) => void) | null = null;
    setupBridge({
      "events.shuttingDown": (cb: (notice: AppShutdownNotice) => void) => {
        fire = cb;
        return () => {};
      },
    });

    render(<ShutdownOverlay />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    act(() => {
      fire?.({ reason: "normal" });
    });

    expect(screen.getByRole("alertdialog", { name: "Actspace 正在关闭" })).toBeInTheDocument();
    expect(screen.getByText("Actspace 正在安全关闭…")).toBeInTheDocument();
  });

  it("本地更新退出时显示替换应用文案", () => {
    let fire: ((notice: AppShutdownNotice) => void) | null = null;
    setupBridge({
      "events.shuttingDown": (cb: (notice: AppShutdownNotice) => void) => {
        fire = cb;
        return () => {};
      },
    });

    render(<ShutdownOverlay />);

    act(() => {
      fire?.({ reason: "local_update" });
    });

    expect(screen.getByRole("alertdialog", { name: "Actspace 准备更新" })).toBeInTheDocument();
    expect(screen.getByText("Actspace 准备替换应用…")).toBeInTheDocument();
  });

  it("桥不可用（mock 模式）时不挂监听、不渲染", () => {
    render(<ShutdownOverlay />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("卸载时调用取消订阅", () => {
    let offCalled = false;
    setupBridge({
      "events.shuttingDown": () => () => {
        offCalled = true;
      },
    });

    const { unmount } = render(<ShutdownOverlay />);
    unmount();
    expect(offCalled).toBe(true);
  });
});
