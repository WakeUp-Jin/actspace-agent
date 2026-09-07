/** Explicit development fixture. Never imported by the application entry point. */
import React from "react";
import { createRoot } from "react-dom/client";
import { ProviderSettings } from "../../components/settings/ProviderSettings";
import { PageShell } from "../../components/settings/SettingsPrimitives";
import "../../styles/index.css";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "light";
window.actspace = {
  listProviders: async () => {
    if (query.get("loading") === "1") await new Promise(() => {});
    return {
    providers: Object.fromEntries(["deepseek", "kimi", "openrouter"].map((id) => [id, {
      hasApiKey: query.get("empty") !== "1" && id === "deepseek", baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount: 2, enabledModelCount: 2,
    }])),
    credentialStorage: { status: "ready" },
    };
  },
  // Fixture saves always fail visibly; this preview cannot persist credentials.
  connectProvider: async () => ({ ok: false, error: { message: "预览样例：不会保存凭据。" } }),
  updateProvider: async () => ({ ok: false, error: { message: "预览样例：不会保存凭据。" } }),
  createCustomConnection: async () => { throw new Error("预览样例：不会保存凭据。"); },
} as unknown as NonNullable<typeof window.actspace>;

createRoot(document.getElementById("root")!).render(
  <div className="mx-auto min-h-screen bg-app-bg" style={{ width: query.get("width") === "375" ? 375 : "100%", maxWidth: "100%" }}>
    <p className="px-4 py-2 text-[12px] text-text-muted">开发预览 · 固定样例 · 不连接服务或保存数据</p>
    <PageShell title="模型" description="模型连接、API Key 与模型目录管理。" maxWidth="880"><ProviderSettings /></PageShell>
  </div>,
);
