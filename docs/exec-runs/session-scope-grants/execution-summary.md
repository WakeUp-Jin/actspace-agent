# Desktop Session Scope Grant — 执行摘要

## 执行状态

> 实现与自动化验收完成。真实 Electron 重启、Session 切换和三态主题矩阵保留人工验收。

## 基本信息

- **关联计划**：`docs/exec-plans/completed/session-scope-grants.md`
- **执行过程**：`docs/exec-runs/session-scope-grants/execution-process.md`
- **执行模式**：交互模式
- **执行结果**：G1–G6 实现和自动化门禁完成

## 核心变更清单

- Desktop 核心文件工具支持当前 Session、当前主 Agent 的 exact/subtree Grant；CLI capability 关闭，不签发或消费。
- Journal 新增 strict grant add/revoke 事实；Projection 通过 add/revoke/tombstone 恢复有效 Grant，不创建第二份持久 store。
- Runtime 按 action/access、Session、Agent、plugin domain、policyVersion、expiry 和路径段完整覆盖匹配，并在 checkpoint 前复验。
- protected、once-only、delete、Bash 和工具自身风险 ask 不可被 Session Grant 覆盖。
- Renderer 只能提交 Runtime suggestionId 或 grantId，不能提交任意路径、action、audience 或 policyVersion。
- Desktop 文件读写审批支持“仅本次”“本会话允许此路径”和显式展开的“本会话允许此目录树”；顶部入口可以查看和撤销 Grant。
- `full-access -> default` 自动撤销 workspace 外 Grant，并使 pending approval 失效。

## Agent 已完成的验证

- `pnpm typecheck`
- `@actspace/shared`：76 tests passed
- `@actspace/tools-approval`：1 test passed
- `@actspace/tools-runtime`：25 tests passed
- `@actspace/tools-core-tools`：18 tests passed
- `@actspace/session-journal`：11 tests passed
- `@actspace/session-projection`：11 tests passed
- `@actspace/runtime`：13 tests passed
- `@actspace/agent-cli`：13 tests passed；真实 help 无 Session Grant 入口
- `@actspace/desktop`：106 files / 756 tests passed
- 文档门禁、旧符号/CLI 暴露扫描和 `git diff --check` 见最终验证记录。

## 人工验证指引

在真实 Electron 中依次验证：

1. default 下访问 workspace 外普通文件，选择“本会话允许此路径”，重复调用不再询问。
2. 展开“选择目录范围”后选择 subtree；目录内命中，路径前缀相似的兄弟目录不命中。
3. 关闭并重新打开同一 Session，Grant 恢复；切换到其他 Session 不泄漏。
4. 从顶部权限入口撤销 Grant，下一次调用重新询问。
5. 在 pending approval 或 checkpoint 前撤销/降级，调用不执行；已越过 checkpoint 的调用不被错误改写为未执行。
6. `full-access -> default` 后 workspace 外 Grant 消失。
7. `.env` 等 once-only 不显示 Session 选项；protected 资源 hard deny；Bash/delete 只显示一次审批。
8. 子 Agent 不继承主 Agent Grant；CLI 继续只支持 once/deny。
9. 浅色、深色和跟随系统主题下检查审批卡、目录范围展开和 Grant 管理弹层的溢出、对比度与键盘操作。

## 已知边界

- project、跨 Session 和用户级持久 Grant未实现，也没有兼容占位。
- Browser、Network、Bash pattern、delete Grant 与 Subagent 继承未实现。
- 自动化不替代真实 Electron reload、主题、Session 切换、真实文件系统竞态和 packaged app 验收。
- 跨平台 sandbox、DMG、签名和 notarization 不在本计划范围。

## 2026-09-25 Computer Use 补验（被锁屏中断）

本轮没有改生产代码；使用合成临时文件，不访问真实凭据。保留前轮修改。

- **通过：subtree 签发**。实际展开目录范围并批准；Journal selector 为 subtree，仅覆盖合成 `scope` 目录。
- **通过：路径段隔离**。目录内第二个文件直接读取成功；`scope-sibling` 同前缀兄弟目录重新触发审批，点击拒绝后停止。
- **通过：once-only 优先级**。已授权目录内合成 `.env` 仍弹审批，仅有“跳过/仅本次”，没有 session 选项；本轮拒绝读取。
- **通过：进程重启恢复与复用**。正常退出并 `pnpm dev:log` 重启；原 Session 恢复授权 1 条，实际 force 读取目录内文件成功且未重新询问。
- **通过：full-access 不自动放行 Bash**。切换完全访问后 `pwd` 仍等待审批，Journal supportedLifetimes 严格为 once；点击 Skip 后返回 user-denied，没有执行。
- **UI 问题：Bash 仍展示 Allowlist/prefix**。点击只是展开 prefix 信息，本次没有签发任何 Bash Grant；文案与当前 once-only 模型不符，需独立处理，不能从该文案推断后端存在 allowlist 授权。
- **UI 问题：目录树批准前没有直观显示实际目录根**。审批卡展示文件路径，展开后只有“本会话允许此目录树”；Journal 的根范围正确，但用户批准前不易确认目录范围。
- protected 合成 `.ssh/id_qa` 已发送实际工具测试；最终 UI 核验因 macOS 锁屏被阻断，不能记为已完成 Computer Use 验收。
- 本轮自动补验：tools-runtime 25、tools-approval 1、session-projection 11、compaction 6、CLI 13 tests 通过；不替代剩余桌面验收。

### 暂存状态与剩余项目

锁屏时测试 Session 仍为 **full-access、目录 read Grant 1 条**，仅涉及合成临时目录；解锁后需继续降级撤销并最终恢复默认/授权 0。尚未完成：跨 Session/子 Agent 隔离、write Grant、pending 降级/取消、delete 审批、权限卡三态/键盘/窄窗口，以及 protected 最终 UI 确认。Chat 附件上传还需要用户确认合成附件发送到当前模型，其他已知 Chat 失败与剩余项以 Chat 执行摘要为准。
