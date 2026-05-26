# 内置 ripgrep fallback

## 背景

用户反馈 Grep/Glob 依赖 `rg` 时，如果本机没有安装 ripgrep，会导致工具不可用。期望应用可以自带 ripgrep 二进制，避免要求用户通过 Homebrew 或其他方式额外安装。

## 主要改动

- 在 `@actspace/agent-core` 中新增 `@vscode/ripgrep` 依赖，作为 bundled ripgrep fallback。
- 新增 `tools/subprocess/ripgrep-path.ts`，统一解析 `rg` 可执行文件来源：
  - `ACTSPACE_RG_PATH` 显式配置。
  - 系统 `rg`。
  - bundled `@vscode/ripgrep`。
- `runRipgrep()` 改为先解析可执行文件，再调用受控子进程 runner。
- 保持 Grep/Glob executor 不感知二进制来源，仍只依赖 `runRipgrep()`。
- 更新 subprocess 测试，覆盖显式路径、系统路径缺失时使用 bundled fallback、无可用 binary 时返回清晰错误。

## 设计取舍

- 不做运行时下载或安装，避免网络和权限不确定性。
- 不在用户已有系统 `rg` 时删除 bundled binary，避免破坏 Electron 应用包完整性。
- `ACTSPACE_RG_PATH` 是显式覆盖；如果路径无效，直接返回 ripgrep 缺失错误，而不是悄悄退回系统/bundled。

## 验证

- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`

## 后续验收沉淀

- `docs/RELIABILITY.md` 已补充上线前关键验收项：用隔离 `PATH` 模拟系统 `rg` 不可用，确认 bundled `@vscode/ripgrep` 仍能支撑 Grep/Glob。
