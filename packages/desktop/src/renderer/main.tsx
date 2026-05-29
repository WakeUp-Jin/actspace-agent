import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyAppearance } from "./appearance/apply";
import { loadAppearance } from "./appearance/storage";
import "./styles/index.css";

if (typeof window !== "undefined" && window.actspace) {
  document.documentElement.classList.add("is-electron");
}

// 渲染前重放外观偏好，避免字体 / 代码字号先默认再跳变的闪烁。
applyAppearance(loadAppearance());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
