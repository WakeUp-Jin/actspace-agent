import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyAppearance } from "./appearance/apply";
import { loadAppearance } from "./appearance/storage";
import { hasPreloadBridge } from "./api/bridge";
import { ensureBridge, renderBridgeMissing } from "./bridge-bootstrap";
import { TooltipProvider } from "./components/ui/Tooltip";
import { remoteSessionPrefs } from "./target/remote-session-prefs";
import { migrateLegacyRemoteModels, newSessionModels } from "./target/use-model-catalog";
import "./styles/index.css";

if (hasPreloadBridge()) {
  document.documentElement.classList.add("is-electron");
}

const root = document.getElementById("root")!;

// bridge 先就位：外观重放会调 `appearance.setNativeTheme`，App 首帧就会读会话。
void ensureBridge().then((source) => {
  if (source === "missing") {
    renderBridgeMissing(root);
    return;
  }
  // 渲染前重放外观偏好（主题 data-theme + 字体 + 代码字号），避免先默认再跳变的闪烁（FOUC）。
  applyAppearance(loadAppearance());
  // 15 T8：旧的远端模型记录迁到新结构，只做一次（迁移后删除旧 key）。
  migrateLegacyRemoteModels(window.localStorage, remoteSessionPrefs, newSessionModels);
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <TooltipProvider delayDuration={350} skipDelayDuration={120}>
        <App />
      </TooltipProvider>
    </React.StrictMode>
  );
}).catch((error: unknown) => {
  // 开发模式下 mock 动态 import 失败时不留白屏。
  console.error(error);
  renderBridgeMissing(root);
});
