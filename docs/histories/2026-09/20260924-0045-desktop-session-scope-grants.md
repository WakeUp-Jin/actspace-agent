# Desktop Session Scope Grant

## 用户诉求

在不保留旧权限兼容策略的前提下，继续实施下一份权限计划：先交付 Desktop 当前 Session 的文件授权，不做 project 持久化和跨平台 sandbox。

## 本次改动

- 增加 exact/subtree `SessionGrant`、稳定 audience、Runtime suggestion 和 strict Journal add/revoke 事件。
- Session Projection 从 Journal 恢复有效 Grant，并用 revoke tombstone 阻止乱序事实重新激活权限。
- Runtime 只让 Grant 覆盖可复用的 workspace scope ask，按 Session/Agent/audience/policyVersion/action/access/expiry 和全部资源范围匹配。
- `read_file/grep/glob` 共享核心 `file.read` audience，`write_file/edit_file` 共享 `file.write`；Bash、delete、敏感文件、第三方插件和 Subagent 不消费。
- Desktop 审批支持 once/session/deny；Renderer 只提交 suggestionId，Grant 管理只提交 grantId。
- 增加文件读写 exact/subtree 选择、当前 Session Grant 查看/撤销和 mode 降级自动撤销。
- 更新权限设计、安全规范、release notes、质量评分、execution plan 与执行记录。

## 设计动机

可复用授权不是一次审批的缓存，而是有明确 subject、audience、selector、生命周期、撤销和审计语义的持久事实。把 Grant 的签发和匹配留在 Runtime，并把 Journal 作为唯一事实源，可以防止 Renderer、Host 临时内存或插件自行扩大权限。

## 关键文件

- `packages/shared/src/runtime-v2/permission.ts`
- `packages/tools/runtime/src/permission/grants.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/session/journal/src/core-codecs.ts`
- `packages/session/projection/src/facts.ts`
- `packages/tools/core-tools/src/plugin.ts`
- `packages/desktop-app/src/service.ts`
- `apps/desktop/src/main/runtime-v2/approval-broker.ts`
- `apps/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `apps/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`

## 验证

- 全仓 typecheck 通过。
- Runtime、core-tools、Journal、Projection 和 Desktop 定向/全量自动化通过。
- exact/subtree、多资源、path segment、read/write、Session/Agent/audience/policyVersion/expiry、tombstone 和 suggestionId 均有回归。
- 真实 Electron reload、Session 切换和三态主题保留人工验收。
