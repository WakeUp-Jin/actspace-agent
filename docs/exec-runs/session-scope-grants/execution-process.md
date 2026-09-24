# Desktop Session Scope Grant — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/session-scope-grants.md`
- **执行模式**：交互模式
- **开始时间**：2026-09-23 CST
- **结束时间**：2026-09-24 CST

## 执行时间线

### 步骤 1：持久合同与 Projection

- **操作**：增加 `SessionGrant`、exact/subtree selector、audience、suggestion 和 lifetime DTO；新增 `permission/grant-added`、`permission/grant-revoked` required codec；Session Projection fold 有效 Grant。
- **关键决定**：Session Journal 是唯一持久事实源，不增加 Host GrantStore。未知 revoke 先写 tombstone，后续同 grantId 的 add 不能复活，保证乱序恢复 fail-closed。
- **验证**：action/access、selector、绝对路径、policyVersion、时间和来源字段负向测试通过；完整 replay 与增量 projection 结果稳定。

### 步骤 2：Runtime GrantResolver 与签发

- **操作**：Tool Permission Contract 增加稳定 `grantAudience` 和 `suggestGrants`；Runtime 在进入 Broker 前匹配有效 Grant，在 session decision 后校验 suggestionId、写入 grant-added，并在 checkpoint 前重新验证当前全部资源仍被有效 Grant 覆盖。
- **关键决定**：Grant 只能消解可复用的 workspace scope ask；protected、once-only、delete、Bash 和工具自身 ask 始终优先，不能被 Grant 覆盖。
- **验证**：exact/subtree、路径段边界、多资源完整覆盖、read/write 隔离、Session/Agent/audience/policyVersion/expiry 隔离与 session 签发回归通过。

### 步骤 3：核心文件建议与 Host ceiling

- **操作**：`read_file/grep/glob` 提供 `file.read` suggestion，`write_file/edit_file` 提供 `file.write` suggestion；默认 exact，受限 subtree candidate 只取当前文件父目录或当前目录本身。
- **关键决定**：禁止建议 `/`、Home、Documents、Desktop 或包含 workspace 的共同祖先；Renderer 默认不展示 subtree，只有用户显式打开目录范围选择后才显示 Runtime 已生成的 candidate。
- **验证**：Bash/delete 不提供 Session lifetime，敏感或混合不可复用原因不提供 suggestion，CLI Host capability 未启用。

### 步骤 4：Desktop 审批、管理与撤销

- **操作**：Desktop Broker/Registry/typed IPC 支持 `once/session/deny`；Renderer 回传只允许 `requestId + decision + suggestionId`，撤销只允许 `sessionId + grantId`；文件读写审批展示 exact/subtree；顶部权限入口列出并撤销当前 Grant。
- **关键决定**：路径、action、audience 和 policyVersion 不从 Renderer 回传。Main registry 先确认 suggestionId 属于当前 pending request，Runtime 再做最终校验。
- **验证**：写入审批、读取审批、目录显式展开、grant manager 和 broker 定向测试通过；Desktop 全量测试通过。

### 步骤 5：mode 降级与运行中变化

- **操作**：`full-access -> default` 在同一批 Journal 写入中撤销 workspace 外 Grant，再写 mode-set；Registry 同时使当前 Session pending approval 失效。用户撤销允许在 turn active 时写入，尚未越过 checkpoint 的调用会在 Runtime re-check 中失败。
- **关键决定**：不追溯取消已经越过 durability checkpoint 的调用；只改变未来准入和尚未越过 checkpoint 的 prepared call。

### 步骤 6：文档、计划与质量收口

- **操作**：更新权限事实源、执行安全入口、安全规范、质量评分、release notes、history 和学习文档；把计划移入 completed。
- **范围边界**：不实现 project/跨 Session 持久化、CLI Grant、Bash pattern、Browser/Network Grant、Subagent 继承或跨平台 sandbox。

## 遇到的问题

- 初版 Runtime re-check 只检查一个 grantId 是否仍存在，无法证明多资源调用仍被完整覆盖；改为重新运行完整 GrantResolver。
- 初版 subtree suggestion 对目录资源取了父目录，可能把 grep/glob 范围扩大一级；改为目录资源使用自身路径，文件资源才使用父目录。
- Projection 初版忽略“先 revoke 后 add”的未知引用，会让乱序 add 重新激活；改为保留 revoke tombstone。
- 读取类工具最初只有 Runtime 支持 Session Grant，Renderer 没有选择入口；补齐 read/grep/glob 的通用文件读取审批卡。

## 跳过或推迟的事项

- 真实 Electron reload、Session 切换、浅色/深色/跟随系统主题和完整人工交互矩阵。
- project、跨 Session、用户级持久 Grant。
- CLI Session Grant、Bash/Browser/Network Grant、Subagent 继承。
- Windows/Linux sandbox、DMG、签名与 notarization。
