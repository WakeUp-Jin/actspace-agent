# TODO List

这个文件只记录当前需要持续推进的仓库级任务。复杂任务的范围、依赖和验收以 `docs/exec-plans/active/` 中的计划为准。

## 当前焦点

| 事项 | 状态 | 入口 | 下一步 |
| --- | --- | --- | --- |
| ActSpace v2 多包插件化发布门禁 | 实现完成，外部门禁待验收 | `docs/exec-plans/active/20260824-actspace-v2-package-layout-and-plugin-packaging/README.md` | 继续真实 Provider、Electron、DMG/签名验收；Browser Bridge 按用户要求从本轮分离，后续单独修复。 |
| 前端 UI 组件基础 | 待执行 | `docs/exec-plans/active/frontend-ui-components-foundation.md` | 先确认组件边界和迁移顺序，再以小切片替换重复实现。 |

## 未来方向

- Agent Team / Room 保留为 `future-product-design`，不能继续执行已丢弃的 v1 计划；需要时从 v2 Session、Tool ABI 和插件生命周期重新立项。
- Bash 动态 allowlist 与全局执行策略尚未作为 v2 能力排期；需要时以 `docs/design-docs/execution-safety/README.md` 为当前边界新建计划。
- 尚未进入 execution plan 的工作继续记录在 `docs/exec-plans/tech-debt-tracker.md`，不要为了占位创建空计划。

## 维护规则

- 新增跨多轮任务时，先在这里增加一行总控 TODO，再视复杂度创建 execution plan。
- 任务完成后从当前焦点移除，并将计划归档到 `completed/`；不在这里维护第二份完成清单。
- 被替代或放弃的计划移动到 `discarded/`，不要删除历史决策上下文。
