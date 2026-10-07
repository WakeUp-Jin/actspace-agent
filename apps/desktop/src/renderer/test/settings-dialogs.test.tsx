import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LocalUpdateState } from "@actspace/shared";
import { ImageGenerationSettingsDialog } from "../components/settings/dialogs/ImageGenerationSettingsDialog";
import { LocalUpdateProgressDialog } from "../components/settings/dialogs/LocalUpdateProgressDialog";
import { ProviderKeyModal } from "../components/settings/dialogs/ProviderKeyModal";
import { setupBridge } from "./helpers/bridge";

// Radix 在 setTimeout(0) 里还焦点。
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const overlay = () => document.querySelector<HTMLElement>("[data-state=open].fixed")!;

function Opener({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>{label}</button>{open ? children(() => setOpen(false)) : null}</>;
}

function localUpdateState(phase: LocalUpdateState["progress"]["phase"]): LocalUpdateState {
  return {
    sourceRoot: "/repo", sourceValid: true, appExecutablePath: "/A.app/Contents/MacOS/A", appIsPackaged: true, appPath: "/A.app",
    installParent: "/", canUpdate: true, logPath: "/tmp/update.log", running: phase === "building",
    progress: { phase, message: phase === "building" ? "正在构建" : "构建失败" },
  };
}

describe("ImageGenerationSettingsDialog", () => {
  it("keeps Tab inside, ignores outside clicks and Escape while saving, and returns focus", async () => {
    let finish!: () => void;
    setupBridge({ "settings.updateImageGeneration": vi.fn(() => new Promise<{ ok: true }>((resolve) => { finish = () => resolve({ ok: true }); })) });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Opener label="配置">
        {(close) => (
          <ImageGenerationSettingsDialog
            current={{ hasApiKey: false, baseUrl: "https://example.com/v1", model: "image-1" }}
            onClose={() => { onClose(); close(); }}
            onClear={async () => undefined}
            onRefresh={async () => undefined}
          />
        )}
      </Opener>,
    );
    await user.click(screen.getByRole("button", { name: "配置" }));
    const dialog = screen.getByRole("dialog", { name: "配置图片生成服务" });
    expect(dialog).toHaveAccessibleDescription("密钥只在 main 进程解密使用；保存后从下一次图片生成调用生效。");
    expect(screen.getByLabelText("图片生成服务 API Key")).toHaveFocus();
    for (let index = 0; index < 6; index += 1) await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.click(overlay());
    expect(onClose).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("图片生成服务 API Key"), "sk-test");
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.getByRole("button", { name: "配置" })).toHaveFocus();
  });

  it("closes on Escape when idle and focuses the given returnFocus element", async () => {
    setupBridge();
    const user = userEvent.setup();
    const target = document.createElement("button");
    target.textContent = "返回目标";
    document.body.append(target);
    render(
      <Opener label="编辑">
        {(close) => (
          <ImageGenerationSettingsDialog
            current={{ hasApiKey: true, baseUrl: "https://example.com/v1", model: "image-1" }}
            returnFocus={target}
            onClose={close}
            onClear={async () => undefined}
            onRefresh={async () => undefined}
          />
        )}
      </Opener>,
    );
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("button", { name: "更换 Key" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await settle();
    expect(target).toHaveFocus();
    target.remove();
  });
});

describe("LocalUpdateProgressDialog", () => {
  it("cannot be dismissed while the update is running", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<LocalUpdateProgressDialog state={localUpdateState("building")} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "本地更新进度" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭更新进度" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(overlay());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape or an outside click once finished, returning focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Opener label="查看进度">{(close) => <LocalUpdateProgressDialog state={localUpdateState("failed")} onClose={close} />}</Opener>);
    await user.click(screen.getByRole("button", { name: "查看进度" }));
    const dialog = screen.getByRole("dialog", { name: "本地更新进度" });
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await settle();
    expect(screen.getByRole("button", { name: "查看进度" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "查看进度" }));
    await user.click(overlay());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ProviderKeyModal", () => {
  it("keeps its h3 title, traps Tab, closes on Escape or an outside click and returns focus", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => ({ ok: true as const }));
    render(<Opener label="连接">{(close) => <ProviderKeyModal provider="tavily" onClose={close} onSave={onSave} />}</Opener>);
    await user.click(screen.getByRole("button", { name: "连接" }));
    const dialog = screen.getByRole("dialog", { name: "连接 Tavily" });
    expect(screen.getByRole("heading", { name: "连接 Tavily", level: 3 })).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription(/输入你的 Tavily API Key/);
    expect(screen.getByLabelText("Tavily API Key")).toHaveFocus();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByLabelText("Tavily API Key")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await settle();
    expect(screen.getByRole("button", { name: "连接" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "连接" }));
    await user.click(overlay());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
