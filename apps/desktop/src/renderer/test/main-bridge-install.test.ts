import { act, screen, waitFor } from "@testing-library/react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopBridgeContract } from "@actspace/shared/desktop-bridge";
import { ensureBridge } from "../bridge-bootstrap";

// main.tsx 不导出 root；记下它创建的 root，用例结束先卸载 App，再移除 bridge，避免卸载前的 effect 读到空 bridge。
const mountedRoots = vi.hoisted(() => [] as Root[]);
vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  const createRoot: typeof actual.createRoot = (...args) => {
    const root = actual.createRoot(...args);
    mountedRoots.push(root);
    return root;
  };
  return { ...actual, createRoot, default: { ...actual, createRoot } };
});

function clearBridge() {
  delete (window as unknown as { actspace?: unknown }).actspace;
}

describe("renderer bridge bootstrap", () => {
  beforeEach(() => {
    clearBridge();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    act(() => { for (const root of mountedRoots.splice(0)) root.unmount(); });
    vi.unstubAllEnvs();
    vi.resetModules();
    clearBridge();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
  });

  it("keeps the Electron preload bridge untouched", async () => {
    const preload = { sessions: {} } as unknown as Window["actspace"];
    window.actspace = preload;

    await expect(ensureBridge()).resolves.toBe("electron");
    expect(window.actspace).toBe(preload);
  });

  it("installs a complete mock bridge in development and honours ?mock=", async () => {
    window.history.replaceState(null, "", "/?mock=remote-host");

    await expect(ensureBridge()).resolves.toBe("mock");

    for (const [domain, members] of Object.entries(desktopBridgeContract)) {
      for (const member of Object.keys(members)) {
        expect(typeof (window.actspace as unknown as Record<string, Record<string, unknown>>)[domain]?.[member], `${domain}.${member}`).toBe("function");
      }
    }
    expect(window.actspace).not.toHaveProperty("listSessionPage");
    expect(window).not.toHaveProperty("actspaceHosts");
    expect((await window.actspace.hosts.list()).map((host) => host.state)).toEqual(["connected", "offline", "revoked"]);
  });

  it("renders a fatal page instead of the App when a production build has no bridge", async () => {
    vi.stubEnv("DEV", false);

    await import("../main");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("无法连接桌面服务");
    expect(alert).toHaveTextContent("Desktop bridge missing");
    expect(window.actspace).toBeUndefined();
  });

  it("boots the App against the mock bridge in development", async () => {
    await import("../main");

    await waitFor(() => expect(screen.getByRole("button", { name: "新建会话" })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
