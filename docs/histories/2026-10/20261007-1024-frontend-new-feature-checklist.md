## [2026-10-07 10:24] | Task: 前端新功能开发清单与规范入口

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS，本地仓库 main 分支）`

### 📥 User Query

> 这次前端重构有一部分原因是之前没有梳理好前端的全局规范和设计规范。确认有没有补上，让以后新增前端功能时有规范可依、不再漂移。文件行数基线不做自动检查，只在规范里提示；其他都做，并说清文件放在哪里、怎么链接出来。

### 🛠 Changes Overview

**Scope:** `docs/`、`scripts/check-current-docs.mjs`、根 `package.json`

**Key Actions:**

- **新增开发清单**：`docs/design-docs/frontend/front-新功能开发清单.md`，按视觉与样式、组件与弹层、文件拆分、状态归属、调用 main、安全、测试、验收、提交前命令九节列出规则。每条一行，并写出详细规范链接和会拦住违规的命令；没有自动检查的标「评审」。
- **入口串联**：`AGENTS.md`「按任务需要选读」、`docs/FRONTEND.md` 开头、`docs/design-docs/frontend/README.md` 的必读顺序和文档列表、`docs/design-docs/index.md` 的前端阅读路线，都把清单放在最前面。`docs/FRONTEND.md` 的「其中已经包含」补上基础组件 / 弹层原语、会话状态、preload bridge 三份规范。
- **文档检查**：清单加入 `check-current-docs.mjs` 的现行文档列表，失效链接和退役说法会被拦住。
- **行数提示**：在 `front-基础组件封装规范.md`「大组件拆分的目录约定」写明单文件超过 500 行要拆，链接技术债里的 3 个现存文件，并说明没有自动检查。
- **安全链接**：`front-preload-bridge与mock规范.md` §4 末尾补充：涉及外部链接、新窗口、工作区路径的新能力，要遵守 SECURITY 的对应规则。
- **检查接进 `pnpm test`**：新增 `test:ipc-channels` 脚本；`pnpm test` 加上 `check:ipc-channels`、`test:ipc-channels`、`test:frontend-tokens`。`docs/FRONTEND_VERIFICATION.md`「相关自动检查」写明哪些在 `pnpm test`，哪些在 CI 仓库卫生检查。

### 🧠 Design Intent (Why)

重构后，规则已经分散写进视觉语言、主题、基础组件、会话状态、preload bridge、SECURITY 等文档，但缺一个开发前就能看到的总入口。入口文档的阅读顺序也停在重构之前。清单只做索引和一句话规则，细节仍以原规范为准，避免出现两份事实源。IPC 契约审计和 token 检查脚本自己的测试原来不在 `pnpm test` 里，接进去后，CI 能拦住检查脚本本身退化。行数基线按用户决定只做文字提示。

验证：`pnpm -s check:current-docs`（48 份现行文档）、`check:ipc-channels`、`test:ipc-channels`（12 通过）、`test:frontend-tokens`（15 通过）、`check:frontend-tokens`、全量 `pnpm test` 均通过（desktop 192 个文件，1545 通过、2 跳过）。纯文档和脚本改动，不涉及界面，未做 Electron 验收。

### 📁 Files Modified

- `docs/design-docs/frontend/front-新功能开发清单.md`（新增）
- `AGENTS.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/index.md`
- `docs/design-docs/frontend/front-基础组件封装规范.md`
- `docs/design-docs/frontend/front-preload-bridge与mock规范.md`
- `scripts/check-current-docs.mjs`
- `package.json`
