# Plan 0-pre: 仓库合并

状态：已完成

依赖：无
产物消费方：所有后续 Plan

## 目标

将 `actspace-plugins` 仓库的代码（browser-bridge + fs-watch）迁入 actspace-agent 主仓库的 `plugins/` 目录。迁移后 actspace-plugins 仓库降级为历史归档，不再接受新 commit。

## 允许修改的文件

actspace-agent 仓库：
- `plugins/` 目录（新建，整体迁入）
- `docs/ARCHITECTURE.md`（更新结构说明）
- `docs/design-docs/agent-browser-bridge-design.md`（更新路径引用）
- `docs/design-docs/agent-plugins-fs-watch.md`（更新路径引用）
- `docs/design-docs/agent-browser-use-integration-design.md`（更新路径引用）
- `.gitignore`（添加 Go/Rust 构建产物排除）
- `AGENTS.md`（更新"相关平级项目"段落）

## 任务清单

### 任务 pre.1：创建 plugins/ 目录并迁入代码

```bash
mkdir -p plugins

# 迁入 browser-bridge（排除 .git）
cp -R /Users/wakeup-jin/Desktop/code-project/side-project/actspace-plugins/plugins/browser-bridge plugins/browser-bridge

# 迁入 fs-watch（排除构建产物）
cp -R /Users/wakeup-jin/Desktop/code-project/side-project/actspace-plugins/plugins/fs-watch plugins/fs-watch
rm -rf plugins/fs-watch/target
```

验证：
```bash
ls plugins/browser-bridge/apps/cli/main.go  # 文件存在
ls plugins/fs-watch/src/main.rs             # 文件存在
```

### 任务 pre.2：验证 Go 编译

```bash
cd plugins/browser-bridge && go build ./...
```

如果 go.work 中有相对路径引用外部目录，需要调整为本仓库内的相对路径。

当前 go.work 内容预期为：
```
go 1.21

use (
    ./apps/cli
    ./packages/protocol
)
```

确认无需修改（已是相对路径）。

验证：
```bash
cd plugins/browser-bridge && go test ./...
```

### 任务 pre.3：验证 Rust 编译（fs-watch）

```bash
cd plugins/fs-watch && cargo build --release
```

确认 Cargo.toml 无外部路径依赖。

### 任务 pre.4：更新 .gitignore

在根目录 `.gitignore` 追加：

```gitignore
# Plugins build artifacts
plugins/fs-watch/target/
plugins/browser-bridge/apps/cli/abb
```

### 任务 pre.5：更新 AGENTS.md

将"相关平级项目"段落更新：

旧：
```
- `/Users/wakeup-jin/Desktop/code-project/side-project/actspace-plugins/`：外部能力插件集合仓库；`fs-watch` 位于 `plugins/fs-watch/`，Browser Use / Browser Bridge 主线代码位于 `plugins/browser-bridge/`。
- `/Users/wakeup-jin/Desktop/code-project/side-project/agent-browser-bridge/`：Browser Bridge 迁移来源仓库；保留作历史上下文，新的主位置以 `actspace-plugins/plugins/browser-bridge/` 为准。
```

新：
```
- `plugins/browser-bridge/`：Browser Use / Browser Bridge 代码（Go CLI + Chrome Extension + 协议层）。原位于独立仓库 `actspace-plugins`，已于 2026-07-10 合并入主仓库。
- `plugins/fs-watch/`：文件监听 Rust 插件。同上，已合并入主仓库。
- `/Users/wakeup-jin/Desktop/code-project/side-project/agent-browser-bridge/`：Browser Bridge 最早期来源仓库；仅作历史上下文。
```

### 任务 pre.6：更新 docs/ARCHITECTURE.md

在"当前仓库结构"中追加：

```markdown
- `plugins/browser-bridge`：Browser Use Go bridge CLI、Chrome Extension 和协议层。
- `plugins/fs-watch`：文件监听 Rust 插件。
```

在"包分层与依赖边界"中追加：

```markdown
- `plugins/browser-bridge`
  - 独立 Go 模块，不参与 pnpm workspace
  - 通过 Unix socket 与 `agent-core` 通信
  - 不依赖 TS 编译产物
- `plugins/fs-watch`
  - 独立 Rust crate，不参与 pnpm workspace
  - 通过文件契约与 `desktop` main 进程通信
```

### 任务 pre.7：更新设计文档路径引用

在以下文档中，将 `actspace-plugins/plugins/browser-bridge/` 路径替换为 `plugins/browser-bridge/`：

- `docs/design-docs/agent-browser-bridge-design.md`
- `docs/design-docs/agent-browser-use-integration-design.md`
- `docs/design-docs/agent-plugins-fs-watch.md`

将 `actspace-plugins` 的"独立仓库"表述改为"plugins/ 目录"。

### 任务 pre.8：更新 Skill 路径（如有引用）

检查 `packages/agent-core` 和 `packages/desktop` 中是否有硬编码的 actspace-plugins 路径。如有，更新为相对于仓库根的 `plugins/` 路径。

搜索命令：
```bash
rg "actspace-plugins" packages/ docs/
```

逐一修改。

## 验证方式

- `ls plugins/browser-bridge/apps/cli/main.go` 存在
- `ls plugins/fs-watch/src/main.rs` 存在
- `cd plugins/browser-bridge && go build ./... && go test ./...` 通过
- `pnpm build` 通过（TS 侧不受影响）
- `rg "actspace-plugins" .` 仅剩 history 和决策记录中的历史引用

## 回退策略

- `rm -rf plugins/` + revert 文档变更即可恢复。
- actspace-plugins 独立仓库保持原样不动，直到确认合并成功。
