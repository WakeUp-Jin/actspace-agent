## [2026-11-10 04:14] | Task: 间距任意值统计并纳入 check:frontend-tokens 基线

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> （前端评估后续，技术债表 2026-09-26 行「renderer 间距：先统计分布，决定是否收敛到 4px 网格或登记例外，再加检查规则」）继续执行。

### 🛠 Changes Overview

**Scope:** `scripts/`、`docs/design-docs/frontend/`、`docs/exec-plans/`

**Key Actions:**

- **统计**：margin / padding / gap / space / inset 的 `-[Npx]` 任意值共 107 处（desktop 45 文件 99 处，web 6 文件 8 处）。值集中在 `7px` 32、`3px` 18、`5px` 10、`18px` 10；工具类集中在 `gap` 24、`py` 20、`pl` 15；目录集中在 `right-panel/` 24、`space/` 18、`messages/` 17。`w-[…]` / `h-[…]` / `max-w-[…]` 等尺寸任意值约 230 处，不在本次范围。
- **决定**：不一次性全量替换，改为按文件计数的基线「只减不增」。
- **脚本**：`check-frontend-design-tokens.mjs` 新增 `countSpacingLiterals` / `checkSpacingLiterals` / `collectSpacingLiteralCounts` / `loadSpacingLiteralBaseline` 和 `--update-spacing-baseline`；原生按钮的基线比较抽成通用 `checkCountBaseline`，两个基线共用。新文件 `scripts/spacing-literal-baseline.json` 按扫描根分组（`desktop` / `web`）。`runCheck` 多一个 `spacingBaseline` 参数，`runAllChecks` 多一个 `spacingBaselines` 参数。
- **测试**：`frontend-design-tokens.test.mjs` 加 4 个用例（计数边界、基线对比、基线文件与代码精确一致、web 根走自己的分组），现 24 个。
- **文档**：token 规范 §6 写明刻度对应（`p-0.5`=2px 起）、存量分布和收紧流程，§13 检查命令加一句；新功能开发清单 §2 加「间距走 4px 网格」一行；技术债表 2026-09-26 行改为已统计、已入基线，后续动作改为按文件顺手收 + 三个目录可整批收。

### 🧠 Design Intent (Why)

- 任意值不是随机数：`7px`、`3px`、`5px` 都是刻意落在刻度中间（6/8、2/4、4/6 之间），是为对齐图标和字形微调出来的。一次性机械替换会同时改 50 个文件的视觉，没人能逐个在 Electron 里复看；登记为 `LITERAL_ALLOWLIST` 的精确串例外则会有 107 条、每条都「说不清为什么」。基线是第三条路：和原生 `<button>` 一样，存量冻结、新增必须说明，改到哪个文件就把哪个文件收干净。
- 范围只圈 margin / padding / gap / space / inset：这些才是「间距与密度」§6 管的东西；宽高、`max-w` 的像素值很多是内容宽度和窗口尺寸，§11 已经允许，混在一起会让规则失去可执行性。
- 基线文件按扫描根分组而不是两个文件：web 现在只有 8 处，单独一个文件不值得；分组也让 `runAllChecks` 的调用方式和原生按钮基线保持一致。

### 📁 Files Modified

- `scripts/check-frontend-design-tokens.mjs`
- `scripts/spacing-literal-baseline.json`（新增）
- `scripts/test/frontend-design-tokens.test.mjs`
- `docs/design-docs/frontend/front-视觉token规范.md`
- `docs/design-docs/frontend/front-新功能开发清单.md`
- `docs/exec-plans/tech-debt-tracker.md`
