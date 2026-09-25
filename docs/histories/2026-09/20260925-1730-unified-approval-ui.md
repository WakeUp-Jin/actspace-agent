# 统一工具审批界面

## 变更

- 新增根目录 `TODO.md`，记录 Bash 沙盒和命令前缀 Allowlist 后续需求。
- 将会话权限入口从窗口顶部移到 Composer 底部状态栏，Chat 表单隐藏该入口；底栏只保留权限模式按钮。
- 审批动作统一使用“拒绝”和工具语义对应的一次性动作；文件授权可用时显示简短的“本会话”按钮。
- 移除审批卡上的“选择目录范围”和授权管理入口，目录授权范围由权限服务根据请求自动判断。
- 权限模式入口改为 Composer 底栏的盾牌图标按钮，使用向上弹出的单选菜单提供“自动”和“完全权限”。

## 边界

本轮没有实现 Bash 沙盒、Prefix Allowlist、Always Run，也没有扩大现有后端授权能力。

## 验证

- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/permission-mode-control.test.tsx`
- `pnpm --filter @actspace/desktop build`
- `pnpm --filter @actspace/desktop build:renderer`
- `pnpm check:frontend-theme`
