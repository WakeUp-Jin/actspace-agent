## [2026-11-09 15:20] | Task: 定前端图标规范，统一 lucide 命名与线宽，补防回流检查

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 还有现在前端界面的一些图标是不是标准的？再评估一下现在的前端代码怎么样，包括前端的规范是否合理。……先完成第一个吧。

（评估结论里的第一条建议：补一节图标规范，统一线宽与别名，并加检查规则守住。）

### 🛠 Changes Overview

**Scope:** `docs/design-docs/frontend/`、`docs/exec-plans/tech-debt-tracker.md`、`scripts/check-frontend-design-tokens.mjs` 及其测试、`apps/desktop/src/renderer`（约 100 个组件文件的机械替换）、`apps/web/src`

**Key Actions:**

- **规范**：`front-视觉token规范.md` 新增 §12「图标」：尺寸档位 12 / 14 / 16 / 18 / 20 / 22（大图标 28 / 40 / 56）；业务组件不传 `strokeWidth`，统一用 lucide 默认线宽；导入 lucide 规范名、不用别名；同一含义只用一个图标（终端 `SquareTerminal`、外链 `ExternalLink`、刷新 `RefreshCw`、重置 `RotateCcw`），并给出完整的「不要用 → 用」表；手绘 SVG（轨迹 kind 图标、文件类型 glyph、品牌 logo、环形图）登记为例外。原 §12 检查命令顺延为 §13。`front-新功能开发清单.md` §2 加一行图标规则。
- **检查脚本**：`check-frontend-design-tokens.mjs` 新增 `icon-stroke-width-literal` 规则（拦 JSX 里任何 `strokeWidth=`）和 `checkLucideImports`（解析 `import { … } from "lucide-react"` 的 specifier，对照 `LUCIDE_ICON_RENAMES` 表报别名与同义图标）；desktop 与 web 两个扫描根都生效。`LITERAL_ALLOWLIST` 按「文件 + 精确串」登记 `kind-icons.tsx`、`FileTypeIcon.tsx`、`ProviderLogo.tsx`、`stats-ui.tsx` 的手绘线宽。测试补 4 组用例。
- **机械替换**：51 个文件的 68 个 lucide 别名导入改为规范名（`Loader2`→`LoaderCircle`、`Trash2`→`Trash`、`MoreHorizontal`→`Ellipsis`、`CheckCircle2`→`CircleCheck`、`AlertTriangle`/`TriangleAlert`→`TriangleExclamationPoint`、`AlertCircle`/`CircleAlert`→`CircleExclamationPoint`、`ShieldAlert`→`ShieldExclamationPoint`、`CircleHelp`→`CircleQuestionMark`、`Code2`→`CodeXml`、`FileCode2`→`FileCodeCorner`、`BarChart3`→`ChartColumn`、`AlignLeft`→`TextAlignStart`、`WrapText`→`TextWrap`、`ArchiveRestore`→`ArchiveArrowUp`），同义图标统一（`Terminal`/`TerminalSquare`→`SquareTerminal`、`SquareArrowOutUpRight`→`ExternalLink`、`RotateCw`→`RefreshCw`）；89 个文件删除 248 处 lucide 图标上的 `strokeWidth`。`SettingsNav` 的 `IconComponent` 类型随之去掉 `strokeWidth`。
- **技术债登记**：`tech-debt-tracker.md` 记录约 190 处非档位图标尺寸（11 / 13 / 15 / 17 等），本轮不改、不进脚本，留给按区域对照收敛。
- **文档同步**：`front-左侧会话栏规范.md` 与 learnings 里的图标名随代码改为规范名。

### 🧠 Design Intent (Why)

- lucide 的别名只是 re-export，渲染出的 `class` 仍是规范名（`Loader2` 渲染成 `lucide-loader-circle`），测试与样式按 class 对图标时和源码对不上，而且不同作者会随手选别名或同义图标，一个含义在界面上出现两三种画法。用一张静态表 + 脚本拦截，比在评审里逐个认更可靠。
- 线宽现状是默认值 241 处对显式值 278 处、显式值从 1.5 到 3 都有，没有任何规则可循；默认已是多数，统一到默认比再定一组线宽档位省事，也让粗细只由尺寸和颜色表达。
- 没有为尺寸加 `ICON_SIZE` 常量或 `<Icon>` 包装：不强制尺寸时它就是没人用的间接层；尺寸档位先写进规范和技术债，等存量收敛后再决定是否加脚本规则。
- 例外用已有的 `LITERAL_ALLOWLIST`「文件 + 精确串」机制，不另开一套 per-file 白名单，和圆角例外的登记方式一致。

### 📁 Files Modified

- `docs/design-docs/frontend/front-视觉token规范.md`
- `docs/design-docs/frontend/front-新功能开发清单.md`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `docs/learnings/2026-06/icon-button-tooltip-accessibility.md`
- `scripts/check-frontend-design-tokens.mjs`
- `scripts/test/frontend-design-tokens.test.mjs`
- `apps/desktop/src/renderer/components/**/*.tsx`（图标导入与 `strokeWidth` 的机械替换）
- `apps/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `apps/web/src/**/*.tsx`（同上）
