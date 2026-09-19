## [2026-09-19 21:58] | Task: 修复 Review 工作区注册遗漏

### Execution Context

- Agent: Codex / GPT-6
- Runtime: Codex desktop，本地工作树

### 用户诉求

Review 显示 `workspaceRoot is not registered`。用户确认只允许维护应用工作区清单，不自动初始化 Git 仓库。

### 变更

- 目录选择 IPC 增加显式的工作区注册选项，仅添加工作区、使用现有目录入口启用；父目录和能力配置选择不注册。
- DesktopRuntimeV2Registry 创建会话前注册工作区，启动时从持久化会话摘要合并遗漏工作区，保留隐藏偏好与稳定 ID。
- Review 与 Git 操作的未知路径拒绝逻辑保持有效。
- 补充目录选择、会话创建、旧会话恢复、重复启动、取消选择、未知路径拒绝、非 Git 目录无副作用和 Git 变更读取测试。
- 更新 Review 设计文档。学习点命中“可迁移”和“有陷阱”，补充工作区准入边界速记。

### 验证

- 修复前回归测试实际复现选择目录、创建会话、旧会话恢复的注册失败；修复后通过。
- shared build、desktop typecheck、Electron 与 renderer build 通过。
- 扩大 renderer 回归发现会话预览、工具流展示及添加工作区断言三个失败；换回原始 App 源码后同样复现。更新本次相关的添加工作区过期断言，其他两项保留。
- 最终定向测试与 Electron 验收结果在收尾时补充。

### 主要文件

- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/global.d.ts`
- `packages/shared/src/ipc.ts`
- `apps/desktop/src/main/test/runtime-v2-workspace-picker.test.ts`
- `apps/desktop/src/main/test/runtime-v2-workspace-admission.test.ts`
- `apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
