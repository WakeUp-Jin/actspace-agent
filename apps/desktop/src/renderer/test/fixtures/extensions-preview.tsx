/** Explicit visual fixture, never imported by the production application. */
import { createRoot } from "react-dom/client";
import { ExtensionsPage } from "../../components/extensions/ExtensionsPage";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { extensionsSettings, extensionSkills, extensionBrowserStatus } from "./extensionsFixture";
import "../../styles/index.css";
import { setupBridge } from "../helpers/bridge";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "light";
let settings = extensionsSettings();
setupBridge({
  "settings.get": async () => settings,
  "settings.update": async (input) => { settings = { ...settings, skills: { ...settings.skills, ...input.skills } }; return settings; },
  "skills.list": async () => ({ items: extensionSkills, warnings: [] }),
  "browserBridge.getStatus": async () => extensionBrowserStatus,
  "skills.install": async () => ({ ok: false, error: "预览不会安装文件。" }),
  "skills.uninstall": async () => ({ ok: false, error: "预览不会删除文件。" }),
});

createRoot(document.getElementById("root")!).render(
  <div className="mx-auto flex h-screen max-w-full flex-col overflow-hidden bg-app-bg" style={{ width: query.get("width") === "375" ? 375 : "100%" }}>
    <p className="px-4 py-2 text-[12px] text-text-faint">开发预览 · 固定样例 · 不保存数据</p>
    <TooltipProvider><ExtensionsPage /></TooltipProvider>
  </div>,
);
