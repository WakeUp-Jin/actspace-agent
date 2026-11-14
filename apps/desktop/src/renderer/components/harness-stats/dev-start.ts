import type { SettingsSectionId } from "../settings/SettingsNav";
import type { SidebarView } from "../Sidebar";

// 不从统计页引：这个模块在 WorkbenchLayout 里静态引入，会把整个统计页带进首屏 chunk。

/**
 * 浏览器 mock 的起始位置：`?mock=harness-stats` 直接打开「设置 → Harness 统计」，
 * `?mock=usage-stats` 直接打开「设置 → 使用统计」（数据来自 mock/usage-stats-fixture.ts）。
 * 只在开发构建里生效（`import.meta.env.DEV` 在打包版是常量 false），Electron 与打包版永远从聊天页开始。
 */
const START_SECTION: Record<string, SettingsSectionId> = { "harness-stats": "harnessStats", "usage-stats": "usage" };

function params(): URLSearchParams | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  return START_SECTION[search.get("mock") ?? ""] ? search : null;
}

export function devStartView(): SidebarView | null {
  return params() ? "settings" : null;
}

export function devStartSettingsSection(): SettingsSectionId | null {
  const mock = params()?.get("mock");
  return mock ? (START_SECTION[mock] ?? null) : null;
}

/**
 * `&theme=dark|light`：先把主题写进外观偏好的 localStorage，再由 main.tsx 的外观重放读取，
 * 方便无头浏览器截图（它不响应系统深色设置）。本模块在 App 导入时求值，早于外观重放。
 */
function seedTheme(): void {
  const theme = params()?.get("theme");
  if (theme !== "dark" && theme !== "light") return;
  try {
    const key = "actspace.appearance.v1";
    const current = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    window.localStorage.setItem(key, JSON.stringify({ ...current, theme }));
  } catch {
    // localStorage 不可用时保持默认主题。
  }
}
seedTheme();
