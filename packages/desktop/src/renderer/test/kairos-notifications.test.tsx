/**
 * Kairos 通知列表（KairosNotificationList + tab 徽标）行为测试：
 * 列表渲染 / 点击已读 + 行内展开 / 全部已读 / push 徽标更新。
 * 设计见 docs/design-docs/kairos/agent-kairos-notifications.md。
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KairosBridgeApi, KairosNotification } from "@actspace/shared";
import {
  KairosNotificationActions,
  KairosNotificationList,
  KairosNotificationTabBadge,
  useKairosNotifications,
} from "../components/kairos/KairosNotifications";

function makeNotification(overrides: Partial<KairosNotification> = {}): KairosNotification {
  return {
    id: overrides.id ?? `n-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-07-04T02:30:00.000Z",
    title: overrides.title ?? "CSV 分析完成",
    body: overrides.body ?? null,
    level: overrides.level ?? "info",
    read: overrides.read ?? false,
  };
}

function installBridge(initial: KairosNotification[]) {
  let pushListener: ((n: KairosNotification) => void) | undefined;
  let store = [...initial];
  const bridge = {
    notificationsList: vi.fn(async () => ({
      notifications: [...store],
      unreadCount: store.filter((n) => !n.read).length,
    })),
    notificationsMarkRead: vi.fn(async (req: { id?: string }) => {
      for (const n of store) {
        if (req.id === undefined || n.id === req.id) n.read = true;
      }
      return { ok: true as const, unreadCount: store.filter((n) => !n.read).length };
    }),
    notificationsRemove: vi.fn(async (req: { id?: string; scope?: "read" | "all" }) => {
      const before = store.length;
      if (req.id !== undefined) store = store.filter((n) => n.id !== req.id);
      else if (req.scope === "read") store = store.filter((n) => !n.read);
      else store = [];
      return {
        ok: true as const,
        removedCount: before - store.length,
        unreadCount: store.filter((n) => !n.read).length,
      };
    }),
    onNotification: vi.fn((listener: (n: KairosNotification) => void) => {
      pushListener = listener;
      return () => {
        pushListener = undefined;
      };
    }),
  } as unknown as KairosBridgeApi;
  (window as unknown as { kairos: KairosBridgeApi }).kairos = bridge;
  return { bridge, push: (n: KairosNotification) => pushListener?.(n) };
}

/** 模拟宿主视图：tab 徽标 + 头部操作区 + 列表同 store。 */
function Harness() {
  const store = useKairosNotifications();
  return (
    <div>
      <button type="button" data-testid="tab">
        通知
        <KairosNotificationTabBadge count={store.unreadCount} />
      </button>
      <KairosNotificationActions store={store} />
      <KairosNotificationList store={store} />
    </div>
  );
}

beforeEach(() => {
  delete (window as unknown as { kairos?: KairosBridgeApi }).kairos;
});

describe("Kairos notifications", () => {
  it("renders unread badge and list from initial fetch", async () => {
    installBridge([
      makeNotification({ title: "重要发现", level: "important" }),
      makeNotification({ title: "旧通知", read: true }),
    ]);
    render(<Harness />);

    const badge = await screen.findByTestId("kairos-notification-badge");
    expect(badge.textContent).toBe("1");

    const items = screen.getAllByTestId("kairos-notification-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("重要发现");
    expect(items[0]).toHaveAttribute("data-read", "false");
    expect(items[1]).toHaveAttribute("data-read", "true");
  });

  it("marks a notification read on click, expands body inline, clears badge", async () => {
    const { bridge } = installBridge([makeNotification({ title: "点我", body: "详情内容" })]);
    render(<Harness />);
    await screen.findByTestId("kairos-notification-badge");

    await userEvent.click(screen.getByTestId("kairos-notification-item"));

    expect(bridge.notificationsMarkRead).toHaveBeenCalledWith({ id: expect.any(String) });
    expect(screen.getByText("详情内容")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("kairos-notification-badge")).not.toBeInTheDocument(),
    );

    // 再点一次收起详情
    await userEvent.click(screen.getByTestId("kairos-notification-item"));
    expect(screen.queryByText("详情内容")).not.toBeInTheDocument();
  });

  it("marks all read via the mark-all button", async () => {
    const { bridge } = installBridge([
      makeNotification({ title: "a" }),
      makeNotification({ title: "b" }),
    ]);
    render(<Harness />);
    await screen.findByTestId("kairos-notification-badge");

    await userEvent.click(screen.getByTestId("kairos-notification-mark-all"));

    expect(bridge.notificationsMarkRead).toHaveBeenCalledWith({});
    await waitFor(() =>
      expect(screen.queryByTestId("kairos-notification-badge")).not.toBeInTheDocument(),
    );
    screen
      .getAllByTestId("kairos-notification-item")
      .forEach((item) => expect(item).toHaveAttribute("data-read", "true"));
  });

  it("removes a notification via hover trash with undo window", async () => {
    const { bridge } = installBridge([
      makeNotification({ id: "n-del", title: "要删的" }),
      makeNotification({ title: "留下的", read: true }),
    ]);
    const { unmount } = render(<Harness />);
    await screen.findByTestId("kairos-notification-badge");

    const items = screen.getAllByTestId("kairos-notification-item");
    await userEvent.click(within(items[0]).getByTestId("kairos-notification-delete"));

    // 撤销窗口内：条目先本地隐藏、未读徽标即时归零、出现撤销提示，IPC 尚未发出
    expect(screen.getAllByTestId("kairos-notification-item")).toHaveLength(1);
    expect(screen.queryByTestId("kairos-notification-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("kairos-notification-undo")).toHaveTextContent("要删的");
    expect(bridge.notificationsRemove).not.toHaveBeenCalled();

    // 卸载（切 tab / 关面板）时立即提交待删除，等价于撤销窗口到期
    unmount();
    expect(bridge.notificationsRemove).toHaveBeenCalledWith({ id: "n-del" });
  });

  it("restores the notification when undo is clicked", async () => {
    const { bridge } = installBridge([makeNotification({ id: "n-undo", title: "误删" })]);
    render(<Harness />);
    await screen.findByTestId("kairos-notification-badge");

    await userEvent.click(
      within(screen.getByTestId("kairos-notification-item")).getByTestId(
        "kairos-notification-delete",
      ),
    );
    expect(screen.queryByTestId("kairos-notification-item")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("撤销"));

    expect(screen.getByTestId("kairos-notification-item")).toHaveTextContent("误删");
    expect((await screen.findByTestId("kairos-notification-badge")).textContent).toBe("1");
    expect(bridge.notificationsRemove).not.toHaveBeenCalled();
  });

  it("clears read / all via the clear dropdown, with in-place confirm for clear-all", async () => {
    const { bridge } = installBridge([
      makeNotification({ title: "未读的" }),
      makeNotification({ title: "已读的", read: true }),
    ]);
    render(<Harness />);
    await screen.findByTestId("kairos-notification-badge");

    await userEvent.click(screen.getByTestId("kairos-notification-clear-menu"));
    await userEvent.click(screen.getByTestId("kairos-notification-clear-read"));
    expect(bridge.notificationsRemove).toHaveBeenCalledWith({ scope: "read" });
    await waitFor(() =>
      expect(screen.getAllByTestId("kairos-notification-item")).toHaveLength(1),
    );

    // 清空全部需要原地二次确认
    await userEvent.click(screen.getByTestId("kairos-notification-clear-menu"));
    const clearAll = screen.getByTestId("kairos-notification-clear-all");
    expect(clearAll).toHaveTextContent("清空全部…");
    await userEvent.click(clearAll);
    expect(bridge.notificationsRemove).not.toHaveBeenCalledWith({ scope: "all" });
    expect(clearAll).toHaveTextContent("确认清空？");
    await userEvent.click(clearAll);
    expect(bridge.notificationsRemove).toHaveBeenCalledWith({ scope: "all" });
    await waitFor(() => expect(screen.getByText(/暂无通知/)).toBeInTheDocument());
  });

  it("bumps badge and prepends item when a push notification arrives", async () => {
    const { push } = installBridge([]);
    render(<Harness />);
    await waitFor(() =>
      expect(screen.queryByTestId("kairos-notification-badge")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/暂无通知/)).toBeInTheDocument();

    act(() => {
      push(makeNotification({ title: "实时推送" }));
    });

    expect((await screen.findByTestId("kairos-notification-badge")).textContent).toBe("1");
    expect(screen.getByTestId("kairos-notification-item")).toHaveTextContent("实时推送");
  });
});
