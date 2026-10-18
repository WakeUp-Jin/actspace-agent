## 2026-10-18 14:30 | Task: 修复验收缺陷并迁出已实现原型

### Execution Context

- Agent：Codex 主智能体；Computer Use 按仓库约定委派 gpt-6.1-sol。
- Runtime：Codex Desktop，本地工作区。

### 用户诉求

从 main 创建分支，修复此前验收登记的 Bug；按已审阅计划清理文档，将已实现的 HTML Demo 留在本机桌面备份。完成后一次 commit、push 并创建 PR。后续明确取消备份页面打开检查，保留复制与哈希校验。

### 变更

- Web 新增队列暂停/显式继续入口，按真实 Host 的版本冲突回包刷新重试一次；审批与恢复按钮触控目标至少 44px。
- Desktop 状态行及统计胶囊允许收缩和换行，修正最小窗口附近 Composer/Context 左侧裁切。
- 文件工具基于真实工作区根计算展示相对路径；执行前的资源准入复验不变，外部授权文件仍用绝对路径。
- 历史窗口剔除定稿 chunk 前保留已观测的首 token 时间，不回写 Journal，不制造未知计时。
- Runtime 生命周期测试改为验证当前内置 Harness 自动升级合同，并确保租约释放，保持15秒原超时。
- 31 个 HTML 原型按原目录结构本地备份并校验后迁出，保留共享资产、待实施原型与学习/工具页；10 个实现完成计划归档，修正文档漂移和入口。

### 设计动机与边界

新提交与继续执行是不同动作；历史精简保留展示所需的小型事实；文件身份与展示路径采用相同坐标。旧产物 metadata 不回填，既有未覆盖验收不改成通过。备份不进入 Git，本轮不重写历史、不发布安装包、不合并 PR。

### 主要文件

- `apps/web/src/sessions/use-composer.ts`、`pages/session/QueueTray.tsx`、`styles/session.css`
- `apps/desktop/src/renderer/components/composer/ComposerStatusRow.tsx`、`ComposerStatsPills.tsx`
- `packages/tools/filesystem-write/src/node-ports.ts`
- `packages/runtime/src/session/session-controller.ts`、`harness/tool-composition.test.ts`
- `docs/design-docs/retired-html-demos.md`、`docs/exec-runs/20261018-acceptance-fixes-docs-cleanup/`

验证结果和原生/工程覆盖边界见执行摘要。知识沉淀命中可迁移、陷阱和模式，另记 `docs/learnings/2026-10/20261018-canonical-path-display.md`。
