## 2026-10-06 19:30 | Task: Desktop 前端重构 09：输入框优化（含发送队列）

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-09`。
- 状态：完成（2026-10-07），待验收。子分支 `refactor/desktop-fe-09`（`7f320f46`..收尾提交），squash 到 `refactor/desktop-frontend`。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；第八份是 09：按已确认的 demo 改造输入框（细边阴影、单行胶囊、`+` 统一面板、ModelPicker、发送队列托盘移到输入框上方、运行位置菜单替换远端原生 select），并把 Composer 拆到 500 行以内。

### 主要改动

- **外观与布局（P1）**：
  - 细边柔和阴影；单行胶囊、多行 18px 圆角；进入多行后只有清空才回单行。
  - 28px 的 `+` 和发送按钮，发送按钮按模式着色；模式 chip 只有 × 可点。
  - 定稿 placeholder；输入法组字时 Composer 不接任何按键。
- **发送队列托盘（P2）**：托盘移到输入框外面、紧贴上方；去掉标题行；暂停行在底部；「插入」改名「引导」。
- **`+` 统一面板与模型选择（P3）**：
  - `ComposerPalette`：搜索加模式 / 附件 / Skills › / 模型 ›，键盘两级导航。
  - `ModelPicker`：本机和远端共用，删除远端模型 select。
  - 浮层同一时间只开一个（`ComposerOverlay`）。
- **运行位置（P4）**：
  - 新建页 `RunTargetRow`：工作区 / 分支 / 运行位置，菜单是 `RunLocationMenu`，含远端机器子菜单。
  - 对话中改为只读状态行 `ComposerStatusRow`。
  - 发送和停止的禁用及 tooltip 读 readiness；删掉远端的三个原生 select。
- **规范（P5）**：按实施结果改写聊天输入框规范、工作区与运行位置规范；旧 `message-queue-demo.html` 标为废弃。
- **Composer 拆分（P6）**：1810 → 496 行。`components/composer/` 下新增：
  - 组件：输入框、附件、斜杠菜单、工具栏、Review 条、提示区；
  - hook：键盘、Skills、模型、发送、草稿、浮层；
  - 另有运行位置 helper 和对外类型。
  - 每步都做变异抽查，搬家前就没覆盖的分支补了用例（新增 4 个测试文件）。

### 设计动机

输入框的外观和交互是一路叠出来的：
- 外框厚、单行和多行来回跳；
- `+` 菜单、模型菜单、远端原生 select 各一套；
- 队列托盘塞在输入框里，把胶囊撑成方形。

06 和 demo 确认了统一的样子。同时 `Composer.tsx` 有 1810 行，P1–P4 的改动都要在里面找缝，所以最后用 P6 把它拆开，根组件只留布局和浮层编排。

### 用户决定（2026-10-07）

- 新建 Chat 会话的运行目标行：选 A，维持现状（本机 Chat 不显示这一行，远端 Chat 只显示运行位置）。我原先建议 B。
- 非 Git 仓库时的「新建工作树」：选 A，禁用并写原因（现状）。

两项都不改代码；选项和优缺点见 `acceptance-handoff.md` P4。

### 学习沉淀

- [搬家式重构：先用变异测试看看测试到底守住了什么](../../learnings/2026-10/20261007-mutation-check-for-moves.md)：P6 的 T28 / T30 里，分别有 9 个变异改坏后仍然全绿。

### 文件

- `apps/desktop/src/renderer/components/Composer.tsx`、`components/composer/`（新增 20 个文件，P6 占 14 个）、`MessageQueueTray`、`ContextPopup`
- `apps/desktop/src/renderer/target/`（readiness、模型目录）
- 主题 token：`styles/`；`scripts/native-button-baseline.json`、`scripts/check-frontend-design-tokens.mjs` 白名单
- 测试：`composer*.test.tsx`、`composer-attachments` / `composer-slash-menu` / `composer-toolbar` / `composer-run-helpers`、`run-location-menu`、`run-target-row`、`message-queue-tray*`、`host-feedback`
- 文档：
  - `docs/design-docs/frontend/front-聊天输入框规范.md`
  - `front-workspace-git-worktree-context.md`
  - `docs/desktop-frontend-refactor/06`、README
  - `docs/exec-plans/tech-debt-tracker.md`
  - `docs/exec-runs/20261005-desktop-fe-09-composer/`
