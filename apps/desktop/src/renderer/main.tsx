import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyAppearance } from "./appearance/apply";
import { loadAppearance } from "./appearance/storage";
import { TooltipProvider } from "./components/ui/Tooltip";
import "./styles/index.css";

if (typeof window !== "undefined" && window.actspace) {
  document.documentElement.classList.add("is-electron");
}

// 渲染前重放外观偏好（主题 data-theme + 字体 + 代码字号），避免先默认再跳变的闪烁（FOUC）。
applyAppearance(loadAppearance());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={350} skipDelayDuration={120}>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);
