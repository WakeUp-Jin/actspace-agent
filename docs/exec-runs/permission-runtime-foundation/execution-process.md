# Permission Runtime 基础切换 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/permission-runtime-foundation.md`
- **执行模式**：交互模式
- **开始时间**：2026-09-23 21:43 CST
- **结束时间**：2026-09-23 23:15 CST

## 执行时间线

### 步骤 1：执行前审计

- **操作**：复核设计规范、执行计划、Tool Runtime 当前顺序、Session codec、Desktop/CLI ApprovalBroker、测试分层和前端主题约束。
- **影响文件**：仅新增本执行记录并把计划状态切为 `in-progress`。
- **决定**：只执行 `permission-runtime-foundation`，不提前实现 Session Grant；沿用 definition/executor 分离和 Tool Runtime 外壳所有权，不采用通用 Skill 中的 YOLO/prefix allowlist 示例。
- **验证**：工作树除本轮已批准的设计与计划文档外无其他修改；`pnpm check:docs` 与 `pnpm check:current-docs` 在计划落盘阶段已通过。

### 步骤 2：公共合同与 PermissionEngine

- **操作**：将公共模式直接切换为 `default/full-access`；引入结构化 file/process resource、全局边界、工具判断和 `deny > ask > allow` 合并；删除旧 policy、preset 和 `resolveResourcePaths()` 路径。
- **关键边界**：`full-access` 只扩展文件范围，不自动批准 Bash、删除或敏感文件。
- **验证**：PermissionEngine 决策矩阵、scope、敏感分类与 Runtime prepared execution 回归通过。

### 步骤 3：文件、Bash 与执行点复验

- **操作**：核心文件工具在 admission 阶段 canonicalize 资源，并在真实 syscall 前重新解析；删除和 Bash 固定询问一次；symlink、非普通文件与 protected 路径 fail-closed。
- **关键边界**：Bash 继续使用既有命令 hard reject 与 Host sandbox，权限模式不扩大 shell 语法能力。
- **验证**：core-tools、tools-runtime 测试通过；workspace 内外、once-only 与 protected 资源均有回归。

### 步骤 4：Session mode、Journal 与 Host

- **操作**：新增 strict `permission/mode-set`、`permission/asked`、`permission/decided`、`permission/scope-denied`；Session projection 恢复最后 mode；CLI 显式 mode 写入 Journal，未显式指定时沿用 Session mode；Desktop 增加 mode 控件和 typed IPC。
- **关键边界**：公共 DTO、strict codec 和 Host 都只接受 `once/deny`，不预埋 `session` decision、Grant suggestion 或 lifetime；本轮不创建、恢复或消费 Session Grant。
- **验证**：Journal、Projection、Client、CLI 与 Desktop 回归通过；timeout、abort、invalid/stale decision 都形成终态审计事件。

### 步骤 5：直接切换与文档收口

- **操作**：移除旧 Browser session approval cache、旧 Desktop `allow_similar`、旧 CLI mode 和旧权限事件生产路径；更新 contract matrix、执行安全设计、release、history 与 learning。
- **验证**：全仓 typecheck、文档门禁、contract matrix 漂移检查、源码/构建产物扫描和 `git diff --check` 通过。

## 遇到的问题

- Client 初始空 Session 的 projection revision 为 `-1` 时，旧比较把“尚无当前 revision”误判为已有更新，导致第一份 envelope 不落地；改为只有 current revision 存在时才比较大小，并补回归测试。
- 初次并行运行 CLI 测试和全仓 typecheck 时，后者正清理并重建 `packages/shared/dist`，CLI 短暂报缺少 `./ipc`；依赖构建完成后串行重跑通过。清理型 build 不再与依赖其 dist 的测试并发。
- Trajectory 仍识别旧 `approval/*` 前缀；切换为合并 `permission/asked` 与 `permission/decided`，避免实时审批和历史轨迹分叉。
- 旧 Browser approval registry 会把一次批准缓存成 Session 授权；基础阶段删除缓存，只保留 pending request 生命周期。

## 跳过或推迟的事项

- Desktop Session Grant：属于后续 `session-scope-grants` 计划。
- 跨平台 sandbox：不在本轮范围。
- Bash AST 与命令 pattern：不在本轮范围。
- 真实 Electron 浅色、深色、跟随系统和完整交互矩阵：保留人工验收，不由 jsdom 断言替代。
- 真实 Browser、DMG、签名和 notarization：不在本轮范围。
