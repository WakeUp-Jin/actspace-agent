# Desktop Session Scope Grant

> 状态：实现与自动化验收完成；真实 Electron 重启与三态主题矩阵待人工验收
>
> 执行模式：交互模式
>
> 前置计划：[`permission-runtime-foundation`](./permission-runtime-foundation.md) 位于 completed；自动化验收证据见其执行摘要。
>
> 设计事实源：[`agent-tool-permission-model.md`](../../design-docs/execution-safety/agent-tool-permission-model.md)

## 目标

在已经完成直接权限切换的 Runtime 上，为 Desktop 增加可恢复、可查看、可撤销的文件 Session Grant。Grant 只覆盖当前 Session、当前 Agent 和稳定权限域；支持 exact 文件与用户明确选择的 subtree；不向 CLI、Bash、delete、Subagent 或其他 Session 扩散。

## 范围

包含：

- `SessionGrant`、`FileGrantSelector`、`GrantAudience` 和 `GrantSuggestion`；
- `permission/grant-added` 与 `permission/grant-revoked` strict codec；
- Session Permission Projection 与恢复；
- Runtime GrantResolver、签发、匹配、撤销和 mode 降级联动；
- Desktop once/session/deny 审批；
- exact/subtree 用户选择；
- 当前 Session Grant 管理和撤销 UI；
- Desktop reload、Session 切换和恢复验收。

不包含：

- CLI Session Grant；
- project、跨 Session 或用户级持久 Grant；
- Bash、delete、Browser、Network Grant；
- Subagent 继承；
- arbitrary glob pattern；
- 旧 allowlist、旧 `allow_similar` 或旧 permission event 兼容。

## 背景

必读：

- `docs/design-docs/execution-safety/agent-tool-permission-model.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-session-core-persistence-separation.md`
- `docs/design-docs/agent-plugin-runtime/agent-session-three-read-models.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`

相关代码路径：

- `packages/shared/src/runtime-v2/`
- `packages/tools/approval/src/`
- `packages/tools/runtime/src/permission/`
- `packages/tools/core-tools/src/`
- `packages/session/journal/src/`
- `packages/session/projection/src/`
- `packages/runtime/src/runtime/`
- `apps/desktop/src/main/runtime-v2/`
- `apps/desktop/src/renderer/`

约束：

- Session Journal 是唯一持久事实源，不增加 Host GrantStore；
- Renderer 只能选择 Runtime 生成的 suggestionId；
- Grant 匹配由 Runtime 完成，Projection 不作安全决定；
- CLI Host capability 关闭 Session Grant，不能消费 Desktop Grant；
- mode 从 full-access 降为 default 时撤销 workspace 外 Grant；
- Grant UI 涉及颜色和状态，实施前必须遵守三态主题规范。

## 风险

- 风险：目录建议被自动扩大，形成过宽授权。
  缓解：默认只生成 exact；subtree 必须由用户显式选择当前资源的已解析父目录，禁止建议 Home、Documents 或共同祖先。
- 风险：Projection 状态被误当作授权事实。
  缓解：Journal 是事实，Runtime 每次匹配时仍检查 mode、Host ceiling、sensitivity、audience 和 policyVersion。
- 风险：重启恢复了已撤销或不兼容 Grant。
  缓解：严格按 seq fold add/revoke，schema 或 policyVersion 不兼容时 fail-closed。
- 风险：主 Agent Grant 泄漏给 Subagent。
  缓解：`agentId` 必须精确匹配，增加主/子 Agent 负向 contract test。
- 风险：回滚旧二进制不能理解 Grant required event。
  缓解：保留 Journal，旧版本 browse-only，不做事件降级。

## 任务

### G1：持久合同与 strict codec

修改：

- `packages/shared/src/runtime-v2/` 增加 Grant、selector、audience、suggestion 和管理 DTO；
- `packages/session/journal/src/` 增加 `grant-added/revoked` strict codec；
- codec 验证 action/access、selector、subject、audience、时间和来源字段。

验收：

- action/access 不一致拒绝；
- arbitrary glob、空路径、未知 selector 和无效 policyVersion 拒绝；
- malformed/higher-version required event 使授权恢复 fail-closed；
- Journal 不包含凭据、命令全文或 Renderer 自由文本。

### G2：Permission Projection 与恢复

修改：

- `packages/session/projection/src/` 增加 active Session Grant read model；
- fold `grant-added/revoked`，按 grantId 保留最终状态；
- `packages/runtime/src/runtime/` 在 Session 恢复和每次 Tool Environment 组装时提供当前有效 Grant snapshot。

验收：

- add、revoke、重复 revoke、过期和乱序非法引用有稳定结果；
- 同一 Session reload 恢复有效 Grant；
- 其他 Session、Agent、plugin domain 或 policyVersion 不匹配时不返回可消费 Grant；
- Projection checkpoint 重建结果与完整 Journal fold 一致。

### G3：GrantResolver、签发与撤销

修改：

- `packages/tools/runtime/src/permission/` 增加 matcher、issuer 和 revoker；
- unresolved ask 先用有效 Grant 覆盖，剩余 ask 才进入 Broker；
- Runtime 校验 suggestionId 后签发 Grant 并写 Journal；
- 撤销在 Runtime 校验 Session/Agent 后写 `grant-revoked`；
- mode 降级自动撤销 workspace 外 Grant并使 pending approval 失效。

验收：

- exact、subtree、路径段边界和多资源全覆盖；
- read Grant 不覆盖 write；
- `read_file/grep/glob` 只在 `core-files` 同一 audience 内共享；
- `write_file/edit_file` 只在同一 audience 内共享；
- delete、Bash、第三方插件和 Subagent 不能消费；
- hard deny 和 once-only 始终优先于 Grant。

### G4：核心文件工具 Grant suggestion

修改：

- 文件工具为可保存的 scope ask 提供 exact suggestion；
- Runtime 预先生成受限 subtree candidate，但 Renderer 只有在用户显式展开目录范围选择后才展示和提交其 suggestionId；
- 敏感、delete、多类混合风险和无法完整覆盖的请求不提供 Session lifetime。

验收：

- 单文件请求不自动出现父目录宽授权；
- subtree 不得扩大到 Home、Documents、workspace 共同祖先或 Host ceiling 外；
- 多资源请求只有一个 suggestion 能完整覆盖全部资源时才提供 Session；
- Bash approval request 的 `supportedLifetimes` 始终只有 once。

### G5：Desktop 管理面

修改：

- main approval broker 支持 once/session/deny；
- typed IPC 只接受 requestId、decision kind、suggestionId 或 grantId；
- Renderer 审批面板展示 exact/subtree 的明确范围；
- Session 权限管理面列出来源工具、action、范围、创建时间和撤销命令；
- reload 和 Session 切换清理陈旧等待态。

验收：

- Renderer 无法提交任意路径、action、audience 或 policyVersion；
- 撤销立即影响尚未越过 checkpoint 的调用；
- 已越过 checkpoint 的调用不被错误标记为未执行；
- UI 文本无溢出，浅色、深色和跟随系统主题通过；
- 用户能区分“仅此文件”和“此目录树”。

### G6：收口与验收

修改：

- 更新设计状态、execution-safety 入口、Desktop 用户文档和 release notes；
- 新增一份 history；
- 完成自动化、真实 Electron 和重启恢复验证；
- 完成后将两份 plan 的实际状态分别归档，不把外部门禁留在 active。

验收：

- Session Grant 只在 Desktop 可达；
- CLI 源码、帮助和输出没有 Session Grant 入口；
- `allow_similar` 和旧 allowlist 无源码或构建产物命中；
- 文档与实现矩阵一致。

## 验证方式

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/tools-approval test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/core-tools test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-projection test
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm check:docs
pnpm check:current-docs
```

Desktop 人工矩阵：

- default workspace 内 allow；
- default workspace 外 once；
- exact Session Grant 后重复调用不询问；
- subtree 内命中、兄弟目录不命中；
- revoke 后重新询问；
- reload 后恢复；
- Session 切换不泄漏；
- Subagent 不继承；
- full-access -> default 撤销 workspace 外 Grant；
- protected hard deny；
- once-only 不出现 Session 选项；
- 浅色、深色、跟随系统主题。

不在本计划宣称通过：CLI Session Grant、project Grant、Bash pattern、Browser/Network Grant、Windows/Linux sandbox、签名安装包。

## 回滚

- 代码可以回滚到基础权限计划完成后的 revision；
- 不修改或删除已经写入的 Grant Journal 事件；
- 回滚版本看到新 required Grant 事件时只允许 browse-only；
- 不将 Session Grant 转换成 OnceApproval 或旧 allowlist；
- 需要继续执行时创建新 Session。

## 进度记录

- [x] G1 持久合同与 strict codec。
- [x] G2 Permission Projection 与恢复。
- [x] G3 GrantResolver、签发与撤销。
- [x] G4 文件工具 Grant suggestion。
- [x] G5 Desktop 管理面。
- [x] G6 自动化验证、文档与归档；真实 Electron 人工矩阵保留在执行摘要。

## 决策记录

- 2026-09-23：Session Journal 是唯一持久事实源，不创建 Host GrantStore。
- 2026-09-23：Session Grant 仅支持 Desktop 核心文件 exact/subtree，不扩展 CLI、Bash、delete 或 Subagent。
- 2026-09-23：不兼容旧 `allow_similar`、allowlist 或 permission event。
- 2026-09-24：subtree candidate 由 Runtime 预先约束并生成，Renderer 默认只展示 exact；只有用户显式展开“选择目录范围”后才显示 subtree，回传仍只有 suggestionId。

## 执行文档

执行开始时创建：

- `docs/exec-runs/session-scope-grants/execution-process.md`
- `docs/exec-runs/session-scope-grants/execution-summary.md`
