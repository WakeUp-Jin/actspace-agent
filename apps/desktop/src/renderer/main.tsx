import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyAppearance } from "./appearance/apply";
import { loadAppearance } from "./appearance/storage";
import { hasPreloadBridge } from "./api/bridge";
import { ensureBridge, renderBridgeMissing } from "./bridge-bootstrap";
import { TooltipProvider } from "./components/ui/Tooltip";
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
