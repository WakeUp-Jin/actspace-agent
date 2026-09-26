## [2026-09-26 09:00] | Task: + 菜单改版与空会话形态切换

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> Chat 模式切不回去，参考 Cursor 梳理 + 菜单（不要搜索框、调整样式）；去掉「规划新想法」chip；+ 菜单图标（lucide）很丑，需要替换。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer：Composer / ConversationView / WorkbenchLayout / App）、设计文档

**Key Actions:**

- **+ 菜单改为与输入框同宽的面板**：去掉顶部提示，行内「图标 · 名称 · 灰色说明」；Skills 由悬停侧弹改为点击后原地下钻，顶部「‹ Skills」返回，删除悬停关闭定时器。
- **空会话可切换形态**：新增 `onAgentFormChange` / `ComposerAgentFormSwitch`。Agent 空会话菜单多出 Chat；Chat 空会话标签带 ×，菜单提供 Agent / Plan。App 用目标形态新建会话、带上草稿（切到 Agent 仅保留图片附件），再归档原空会话。已有消息的 Chat 会话保持锁定，标签悬停提示新建 Agent 会话。
- **Agent 形态菜单移除 Agent 行**：Agent 为默认态，由 Plan 标签 × 切回，与规范一致。
- **图标**：Agent `Server`→`Bot`，Plan `ListChecks`→`ListTodo`（菜单、标签、Slash 统一），Chat 附件 `FileText`→`Paperclip`；菜单图标描边 1.9，模式图标使用语义色。
- **移除初始空态「规划新想法 ⇧Tab」chip**，`Shift+Tab` 保留。
- **文档**：`agent-main-chat-form.md`、`front-聊天输入框规范.md` 同步空会话切换与菜单结构。

### 🧠 Design Intent (Why)

形态绑定 Session preset（`actspace.chat` / `actspace.main`，提示词与工具集不同），原地切换需要改后端并处理历史兼容。空会话「换一个新会话」对用户等价于切换，却不触碰 preset 不可变的约束，因此只放开空会话。全宽面板让模式说明有空间展示，下钻避免全宽面板旁无处安放二级菜单。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/test/composer.test.tsx`
- `apps/desktop/src/renderer/test/chat-presentation-recovery.test.tsx`
- `docs/design-docs/agent-runtime/agent-main-chat-form.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`

---

## [2026-09-26 09:40] | Task: 模式菜单与 Chat 附件入口收口、历史消息自动加载

### 📥 User Query

> 去掉 Chat 标签的 ×，菜单补上 Agent，模式图标带颜色（Plan 黄、Chat 绿）；Chat 的 + 只剩一个附件入口很怪，倾向换成直接上传按钮；「加载更早消息」要手动点，希望上滑自动加载。

### 🛠 Changes Overview

- **模式菜单**：模式区改为完整选择器（空会话 Agent/Plan/Chat，已开始的 Agent 会话 Agent/Plan），当前模式打勾，点当前项只关闭菜单。图标色 Agent `text-info`、Plan `text-warning`、Chat `text-operational`；Chat pill 改为 `operational-soft` 绿，去掉 ×。
- **已开始的 Chat 会话**：`+` 换成回形针按钮，直接调起文件选择；空 Chat 会话保留 `+` 以便切换形态。
- **历史消息自动加载**（`ConversationView.tsx`）：预取阈值 80px→240px；停在顶部继续向上滚轮（无 scroll 事件）时用 `onWheel` 兜底；已加载内容填不满视口时自动补页（`clientHeight > 0` 才触发，补页保留贴底跟随）；移除「加载更早消息」按钮，改为加载中状态行，错误+重试保留。
- **测试/文档**：更新 Chat 切换、回形针、分页测试（改用 wheel 触发）；同步 `front-聊天输入框规范.md` 语义色与菜单结构、`agent-main-chat-form.md`。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/test/composer.test.tsx`
- `apps/desktop/src/renderer/test/chat-presentation-recovery.test.tsx`
- `apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/agent-runtime/agent-main-chat-form.md`

---

## [2026-09-26 10:20] | Task: 附件按钮去框、历史分页扩容与瘦身

### 📥 User Query

> 回形针的圆框很丑，参考其他网页聊天的附件入口；加载窗口太小，短会话也频繁触发加载，看看调多大合适。

### 🛠 Changes Overview

- **附件按钮**（`Composer.tsx`）：Chat 回形针改为无边框纯图标，hover/focus 才出现浅色圆底（对齐 ChatGPT / DeepSeek / Kimi）。
- **历史分页**（`packages/runtime/src/runtime/session-controller.ts`）：每页 10→20 Turn；上限默认 200 事件/256KB → 2000 事件/2MB；新增 `slimHistoryWindow`：剔除已定稿消息的 `assistant/chunk`，窗口内非最新且 >24KB 的 `request/context` 收敛为身份字段（`deferredDetail`）；裁剪循环由每次整窗 `JSON.stringify` 改为累计字节，避免放宽上限后的平方级开销。
- **依据**：本机 59 个会话，每 Turn 中位 285 事件/236KB（chunk 占事件 97%）；原上限下 55/59 首页不足一个 Turn。精简后每 Turn 中位 15 事件/15KB，20 Turn 首页全部会话无截断（最长会话 17 Turn）。
- **取舍**：Trajectory 对被收敛的旧请求不再显示完整提示词；完整读取（`afterSeq`/`includeToolDetails`）不受影响。
- **测试/文档**：更新分页测试（20 Turn），新增 chunk 剔除与 context 收敛单测；同步三份读模型/投影/轨迹设计文档。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/Composer.tsx`
- `packages/runtime/src/runtime/session-controller.ts`
- `packages/runtime/src/runtime/session-projection.test.ts`
- `docs/design-docs/agent-plugin-runtime/agent-session-three-read-models.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-session-persistence-projection-architecture.md`
- `docs/design-docs/frontend/front-DSH轨迹能力迁移规范.md`
