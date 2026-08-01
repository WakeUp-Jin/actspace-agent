# Environment 本地分支选择与创建

## 用户诉求

点击 Environment 当前分支时展示可搜索的分支列表，并从列表底部创建并 checkout 新分支；创建弹窗采用紧凑的标题、分支名输入和明确的确认动作。

## 主要改动

- Environment 快照增加本地分支列表和其他 worktree checkout 占用信息。
- 新增 main-owned `switch_branch` mutation；只接受已登记 workspace 和现存本地分支，不 fetch、不自动 stash、不 force。
- 当前分支行改为二级分支选择器，支持搜索、当前项 check、占用分支禁用态和创建入口。
- 创建弹窗调整为 `Create and checkout branch`，保留 `actspace/` 默认前缀与 `Set prefix`。
- 切换或创建成功后统一刷新 Environment、Composer Review summary 和 Review generation；失败保留原 checkout 并展示脱敏 Git 错误。
- 自动化测试覆盖成功切换、未提交冲突、worktree 占用、搜索过滤、创建入口和刷新反馈。
- renderer 在开发态 main/preload 尚未重启、snapshot 暂时缺少新 `branches` 字段时回退到当前分支，避免跨进程 HMR 版本错配造成白屏。

## 设计动机

分支选择属于真实 workspace mutation，不能由 renderer 自行维护状态。列表只展示 main 重新读取的本地分支，切换前再次校验分支和 worktree 占用状态；Git 自身继续负责判断未提交改动是否允许切换，产品不通过隐式 stash 或强制参数改变用户文件。

macOS 中同一路径可能分别表现为 `/var/...` 和 `/private/var/...`，涉及 worktree 占用的测试应比较 `realpath`，不能直接比较字符串。

## 关键文件

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/workspace-environment-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/workspace/WorkspaceChromeControls.tsx`
- `packages/desktop/src/main/test/workspace-environment-service.test.ts`
- `packages/desktop/src/renderer/test/workspace-chrome-controls.test.tsx`
- `docs/design-docs/frontend/front-environment-and-git-actions.md`

## 验证结果

- desktop 全量测试：90 个测试文件、710 条用例通过。
- 分支功能最终定向回归：2 个测试文件、27 条用例通过。
- `pnpm build`、根级 `pnpm typecheck`、主题检查、文档检查、仓库检查和 `git diff --check` 在本功能完成快照通过。
- Electron 真实验证确认 Environment 分支入口可达，并复现、修复了旧 main snapshot 缺少 `branches` 时的白屏。
- 第二份最新 runtime 成功加载 5174；完整浅/深主题操作随后被并发 Composer 图片附件代码的 `imagesUnsupported is not defined` 中断，本次未改动该无关代码。
