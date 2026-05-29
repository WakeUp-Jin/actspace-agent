# 外观页 · 字体设置 + 界面缩放（计划 A）

## 执行状态（2026-05-29）

已实现并通过 typecheck + 全量单测（16 文件 / 144 用例）+ 浏览器 mock 视觉与持久化验证。history：`docs/histories/2026-05/20260529-2310-appearance-fonts-and-zoom.md`。**唯一未覆盖**：Electron 真实环境下「界面字号」整窗缩放（mock 为 no-op，需用户本地启动 app 验证）；验证通过后本计划移入 `completed/`。

> 设计修订（应用户反馈）：「界面字号」由原先的「缩放百分比」改为 **px 基准字号数字**（默认 14px，范围 12–20，仿 Cursor 的 15/17），底层仍按 `uiFontSize / 14` 整窗缩放；同时两个字号都加 **重置按钮**，且对「代码字号」做缩放反向补偿（`codeFontSize / zoom`），保证设定的代码 px 精确渲染、不被界面缩放带偏。`AppearancePrefs.uiZoom` 字段相应改名为 `uiFontSize`。

## 目标

在「设置 → 外观」分区落地用户可调的**字体与字号**能力：

- `UI 字体`：预设字体栈下拉，驱动 `--act-font-ui`（连带 AI 输出正文，因 `--act-font-display` 始终 = `--act-font-ui`）。
- `代码字体`：预设字体栈下拉，驱动 `--act-font-mono`（代码块 / diff / bash 输出 / 行内 code）。
- `界面字号`：用 Electron 整窗缩放 `webFrame.setZoomFactor` 实现，以百分比步进呈现（默认 100%）。
- `代码字号`：CSS 变量 `--act-font-mono-size` 单独调（默认 13px）。

偏好走 renderer `localStorage`，开机在 `main.tsx` 渲染前重放避免闪烁。**几乎纯 renderer 改动**，仅 preload + `global.d.ts` 增加一个同步的 `setUiZoom`。深色主题不在本计划（见计划 B）。

## 范围

- 包含：
  - renderer 新增外观偏好模块：预设字体栈表 + 读写 localStorage + `applyAppearance` 把偏好写到 `:root` CSS 变量并调用整窗缩放。
  - `tokens.css` 新增 `--act-font-mono-size: 13px` 默认；`markdown.css` / `diff.css` / `BashRunBlock` 的代码字号改为消费该变量。
  - `SettingsPage` 外观分区重写：主题占位块保留，新增「字体」「字号」两组（2 个字体下拉 + 2 个步进器），即时生效 + 持久化。
  - `SettingsPrimitives` 新增 `Stepper`（− value +）原子组件。
  - preload 暴露 `setUiZoom(factor)`（`webFrame.setZoomFactor`），`global.d.ts` 补类型。
  - `main.tsx` 开机重放外观偏好。
  - 单测：`applyAppearance` 与外观分区交互；浏览器 mock + Electron 真实验证。
- 不包含：
  - 不做深色主题、不动 `--act-color-*` 色板、不清理硬编码颜色（计划 B）。
  - 不打包字体文件（下拉项仅为带 fallback 的字体栈；保证可用的具体字体留作后续）。
  - 不把外观偏好写进 `settings.json` / `secrets.json` / 任何 IPC `settings:*`（外观是纯 UI 偏好，走 localStorage）。
  - 不改主 Agent / Kairos / 工具 / 模型分区。
  - 不做「减少动效」「实时预览卡」「自由输入字体名」（本轮讨论已排除）。

## 背景

- 必读文档（新会话 / 子 Agent 先读）：
  - `AGENTS.md`
  - `docs/FRONTEND.md` 与 `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/frontend-ui/设置页规范.md`（外观章节为本计划设计依据）
  - `docs/coding-standards/team/frontend-style-scope-conventions.md`（样式所有权：原子组件只管"长什么样"）
- 相关代码路径：
  - 外观分区与原子组件：`packages/desktop/src/renderer/components/settings/SettingsPage.tsx`（`AppearanceSection`，462 行起）、`packages/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
  - 字体 token：`packages/desktop/src/renderer/styles/tokens.css`（`--act-font-ui` / `--act-font-display`（= ui） / `--act-font-mono`，第 5–16 行）、`packages/desktop/src/renderer/styles/tailwind.css`（`@theme inline` 映射）
  - 代码字号消费方：`packages/desktop/src/renderer/styles/markdown.css`（`pre code` 0.86rem / 行内 code 0.9em，第 80–104 行）、`packages/desktop/src/renderer/styles/diff.css`（`font-size: 13px`，第 64–65 行）、`packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
  - 渲染入口：`packages/desktop/src/renderer/main.tsx`
  - preload 与桥类型：`packages/desktop/src/preload/index.ts`（`exposeInMainWorld("actspace", …)`）、`packages/desktop/src/global.d.ts`（`window.actspace` 类型）
  - 测试范例：`packages/desktop/src/renderer/test/settings-page.test.tsx`、`packages/desktop/src/renderer/test/composer.test.tsx`
- 已知约束：
  - `--act-font-display` 当前定义为 `var(--act-font-ui)`，所以**只改 `--act-font-ui` 就能让界面 + 输出正文一起换字**，无需单独控制 display。这正契合「界面字体与输出字体同属 UI 字体」的定稿。
  - `webFrame.setZoomFactor` 是 Electron 能力：在 **preload** 调用（preload 有 Electron 访问权），无需走 IPC。浏览器 mock 下 `window.actspace` 不存在，缩放降级为 no-op。
  - 字号缩放陷阱：UI 组件普遍写死像素（`text-[14px]`），无法靠 root rem 缩放，故界面字号用整窗 zoom；代码字号则因 markdown/diff 已是局部 px/rem，可用单独 CSS 变量精确控制。
  - 整窗 zoom 会连带放大代码块；最终代码视觉字号 ≈ `界面缩放 × 代码字号`，符合「先缩放整窗，再单独微调代码」的直觉，需在说明文案里点明。

## 数据模型与契约（以本节为准）

外观偏好仅存在于 renderer localStorage，键 `actspace.appearance.v1`，JSON：

```ts
// packages/desktop/src/renderer/appearance/types.ts
export type UiFontId = "system" | "sans-modern" | "serif-reading" | "rounded";
export type CodeFontId = "system-mono" | "jetbrains" | "fira" | "source";

export interface AppearancePrefs {
  version: 1;
  uiFontId: UiFontId;      // 默认 "system"
  codeFontId: CodeFontId;  // 默认 "system-mono"
  uiZoom: number;          // webFrame.setZoomFactor 因子，范围 0.8–1.4，步进 0.1，默认 1.0
  codeFontSize: number;    // px，范围 11–18，步进 1，默认 13
}

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  version: 1,
  uiFontId: "system",
  codeFontId: "system-mono",
  uiZoom: 1.0,
  codeFontSize: 13,
};
```

预设字体栈（`packages/desktop/src/renderer/appearance/fonts.ts`）：

```ts
export const UI_FONT_PRESETS: { id: UiFontId; label: string; stack: string }[] = [
  { id: "system", label: "系统默认",
    stack: `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Segoe UI", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif` },
  { id: "sans-modern", label: "现代无衬线",
    stack: `Inter, "Segoe UI", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif` },
  { id: "serif-reading", label: "阅读衬线",
    stack: `Georgia, "Times New Roman", "Songti SC", "SimSun", serif` },
  { id: "rounded", label: "圆润无衬线",
    stack: `"PingFang SC", "Hiragino Sans", "Quicksand", "Segoe UI", sans-serif` },
];

export const CODE_FONT_PRESETS: { id: CodeFontId; label: string; stack: string }[] = [
  { id: "system-mono", label: "系统等宽",
    stack: `"SFMono-Regular", "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace` },
  { id: "jetbrains", label: "JetBrains Mono",
    stack: `"JetBrains Mono", ui-monospace, "SFMono-Regular", Consolas, monospace` },
  { id: "fira", label: "Fira Code",
    stack: `"Fira Code", ui-monospace, "SFMono-Regular", Consolas, monospace` },
  { id: "source", label: "Source Code Pro",
    stack: `"Source Code Pro", ui-monospace, "SFMono-Regular", Consolas, monospace` },
];
```

`applyAppearance(prefs)` 行为（`packages/desktop/src/renderer/appearance/apply.ts`）：

1. `root.style.setProperty("--act-font-ui", uiStack)` —— 界面 + 输出正文一起换。
2. `root.style.setProperty("--act-font-mono", codeStack)`。
3. `root.style.setProperty("--act-font-mono-size", `${codeFontSize}px`)`。
4. `window.actspace?.setUiZoom?.(uiZoom)` —— Electron 整窗缩放；mock 下不存在则跳过。

preload 新增（同步、无 IPC）：

```ts
// packages/desktop/src/preload/index.ts
import { contextBridge, ipcRenderer, webFrame } from "electron";
// …在 actspace 对象内：
setUiZoom: (factor: number) => webFrame.setZoomFactor(factor),
```

`global.d.ts` 在 `window.actspace` 类型补 `setUiZoom: (factor: number) => void;`。

## 任务拆分（按顺序）

> 每个任务结束都跑 `pnpm --filter @actspace/desktop typecheck`，必要时 `pnpm --filter @actspace/desktop test`。

### 任务 1：CSS 变量地基（代码字号变量化）

- 文件：`tokens.css`、`markdown.css`、`diff.css`、`BashRunBlock.tsx`
- 改动：
  - `tokens.css` `:root` 增 `--act-font-mono-size: 13px;`（同时在 legacy alias 区可不暴露）。
  - `markdown.css`：`pre code` 的 `font-size: 0.86rem` → `font-size: var(--act-font-mono-size, 0.86rem)`；行内 `code` 维持相对 `0.9em` 不动（跟随容器即可）。
  - `diff.css`：第 64–65 行 `font-size: 13px` → `font-size: var(--act-font-mono-size, 13px)`。
  - `BashRunBlock.tsx`：若其代码/输出区用固定 `text-[13px]`，改为内联 `style={{ fontSize: "var(--act-font-mono-size, 13px)" }}` 或等价类（保留 `font-mono`）。
- 验证：`typecheck` 通过；手动改 `:root { --act-font-mono-size: 16px }` 时代码块、diff、bash 同步变大，正文不变。

### 任务 2：外观偏好模块（types / fonts / storage / apply）

- 文件（新增）：`packages/desktop/src/renderer/appearance/types.ts`、`fonts.ts`、`storage.ts`、`apply.ts`
- `storage.ts`：`loadAppearance(): AppearancePrefs`（解析失败 / 缺字段回落 `DEFAULT_APPEARANCE`，并对 `uiZoom`、`codeFontSize` 做范围 clamp）、`saveAppearance(prefs)`（`JSON.stringify` 写 `actspace.appearance.v1`）。
- `apply.ts`：`applyAppearance(prefs, root = document.documentElement)` 实现上文 4 步。
- 验证：见任务 5 单测。

### 任务 3：开机重放

- 文件：`packages/desktop/src/renderer/main.tsx`
- 改动：在 `ReactDOM.createRoot(...).render(...)` **之前**调用 `applyAppearance(loadAppearance())`（紧跟 `is-electron` 那段）。
- 验证：刷新页面时字体/代码字号不出现「先默认再跳变」的闪烁。

### 任务 4：UI —— Stepper 原子 + 外观分区重写

- 文件：`SettingsPrimitives.tsx`、`SettingsPage.tsx`
- `SettingsPrimitives.tsx` 新增 `Stepper`：

  ```tsx
  export function Stepper({ value, onChange, min, max, step = 1, format, ariaLabel }: {
    value: number; onChange: (next: number) => void; min: number; max: number;
    step?: number; format?: (v: number) => string; ariaLabel: string;
  }) { /* − [format(value)] +，越界禁用对应按钮，纯展示，状态由调用方持有 */ }
  ```

- `SettingsPage.tsx` `AppearanceSection` 重写（持有 `const [prefs, setPrefs] = useState(loadAppearance())`；每次变更 `update(next){ setPrefs(next); saveAppearance(next); applyAppearance(next); }`）：
  - 保留「主题」组（浅色 已选用 / 深色 即将推出 占位，深色留计划 B）。
  - 新增「字体」组：
    - `UI 字体` → `SettingsSelect`，options 来自 `UI_FONT_PRESETS`，绑定 `uiFontId`。
    - `代码字体` → `SettingsSelect`，options 来自 `CODE_FONT_PRESETS`，绑定 `codeFontId`。
  - 新增「字号」组：
    - `界面字号` → `Stepper`，min 0.8 / max 1.4 / step 0.1，`format = v => `${Math.round(v*100)}%``，绑定 `uiZoom`；说明文案点明「整窗缩放，会连带放大代码」。
    - `代码字号` → `Stepper`，min 11 / max 18 / step 1，`format = v => `${v}px``，绑定 `codeFontSize`。
  - `AppearanceSection` 不再是无参组件（当前 `<AppearanceSection />`），保持无需 `SectionProps`（外观不依赖 `AppSettings`）。
- 验证：`typecheck`；浏览器 mock 里切换字体/字号即时可见（缩放 mock 下 no-op，字体/代码字号有效）。

### 任务 5：preload + 类型 + 单测

- 文件：`preload/index.ts`、`global.d.ts`、`settings-page.test.tsx`、新增 `appearance.test.ts`
- `preload/index.ts` 加 `setUiZoom`；`global.d.ts` 补类型。
- `appearance.test.ts`：`applyAppearance` 写对 `--act-font-ui` / `--act-font-mono` / `--act-font-mono-size`，并在 `window.actspace.setUiZoom` 存在时以正确 factor 调用、不存在时不抛错；`loadAppearance` 对坏 JSON / 越界值正确回落与 clamp。
- `settings-page.test.tsx`：外观分区渲染两个字体下拉与两个步进器；切换字体写入 localStorage 且 `--act-font-ui` 变化；步进器边界禁用。测试 setup 里给 `window.actspace` stub 补 `setUiZoom: vi.fn()`。
- 验证：`pnpm --filter @actspace/desktop test` 全绿。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm --filter @actspace/desktop lint`（若存在）
- 浏览器 mock（`docs/FRONTEND_VERIFICATION.md`）：进入设置 → 外观，切换 UI 字体看侧栏/正文换字、切换代码字体看代码块换字、调代码字号看代码块缩放；刷新后保持。
- Electron 真实验证：额外确认「界面字号」整窗缩放生效（mock 下不可验），且重启 app 后偏好保持。

## 风险与回退

- 风险：整窗 zoom 与代码字号叠加导致代码过大/过小 → 说明文案点明叠加关系；范围 clamp 兜底。
- 风险：预设字体栈在某些机器全部 fallback 到系统默认（未装对应字体）→ 这是预期的优雅降级，不算缺陷；后续若要"保证可用"再打包字体文件（另开计划）。
- 回退：外观全部走 localStorage 与 CSS 变量，删除 `actspace.appearance.v1` 或不调用 `applyAppearance` 即恢复默认；无数据迁移、无 main/IPC 状态，回退零风险。

## 完成标准

- 外观页可改 UI 字体、代码字体、界面字号（整窗缩放）、代码字号，均即时生效并跨刷新/重启保持。
- typecheck / test / lint 全绿；浏览器 mock 与 Electron 真实验证通过。
- `docs/design-docs/frontend-ui/设置页规范.md` 外观章节与实现一致（已先行更新）。
- 记 history 到 `docs/histories/2026-05/`。
