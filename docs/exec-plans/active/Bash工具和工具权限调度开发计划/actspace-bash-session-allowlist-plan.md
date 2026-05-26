# actspace Bash 会话级动态 allowlist + 子命令拆分授权计划

## 目标

让 `allow_similar` 兑现承诺：用户在审核面板上"Allow"之后，可以选择把本次复合命令里哪些子命令前缀加入会话级 allowlist，下一次匹配前缀的命令自动放行；并提供"升级到用户配置"入口让前缀跨会话生效。

本计划只覆盖能力 A（会话级动态 allowlist）与能力 B（Allow 下拉的子命令拆分授权），**不**覆盖能力 C（全局执行策略选择器）与能力 D（真沙箱）。

## 范围

- 包含：
  - `BashAllowlistEntry` / `BashAllowlistStore` 共享契约。
  - `BashAllowlistStore` 的内存实现 + 用户配置持久化实现 (`~/.actspace/bash-allowlist.json`)。
  - `splitForAuthorization(command: string): string[]`：把复合命令拆出可授权前缀。
  - `bashCheckPermissions` 改为消费 store。
  - `ToolScheduler.allow_similar` 决策携带 `allowPrefixes` 时写入 store。
  - `ToolApprovalRequest` 新增 `prefixOptions`；`ApprovalDecideInput.allow_similar` 携带 `allowPrefixes`。
  - 放开 `|` 进入审核流程（hard reject 仍拒绝 `<` `>` `` ` `` `$()` `{}`）。
  - 前端 `BashApprovalBlock`：Allow 按钮升级为 dropdown，列出 prefix 选项，"Add to Allowlist and Run" 主按钮。
  - 右上角 `MoreHorizontal` 菜单提供"添加到用户 allowlist"项，触发 `promote(prefix)`。
  - session.jsonl 新增事件 `bash_allowlist_added`，session 加载时 replay。
  - 对应单测与 fixture 更新。
- 不包含：
  - 全局执行策略字段（`BashExecutionPolicy`）：留给 Phase 2。
  - 沙箱执行：留给 Phase 3。
  - 撤销已有授权的 UI 入口（仅在 store 接口上预留 `remove`，UI 不接）。
  - 通配符 prefix。

## 设计来源

- `docs/design-docs/agent-core/bash-policy-allowlist-design.md`（本计划的设计依据，必读）
- `docs/design-docs/agent-core/权限设计规则和原则.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-permission-scheduler-plan.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md`

## 相关代码路径

- 后端
  - `packages/agent-core/src/tools/scheduler.ts`
  - `packages/agent-core/src/tools/tools/bash/permissions.ts`
  - `packages/agent-core/src/tools/tools/bash/allowlist-store.ts`（新增）
  - `packages/agent-core/src/tools/tools/bash/split-for-authorization.ts`（新增）
  - `packages/agent-core/src/tools/types.ts`
  - `packages/agent-core/src/engine/bridge.ts`
  - `packages/agent-core/src/engine/create-agent-deps.ts`
  - `packages/agent-core/src/internal-tools.ts`
- 共享契约
  - `packages/shared/src/session.ts`
  - `packages/shared/src/ipc.ts`
- main
  - `packages/desktop/src/main/approval-registry.ts`
  - `packages/desktop/src/main/agent-turn.ts`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/main/user-config.ts`（新增）
- preload / renderer
  - `packages/desktop/src/preload/index.ts`
  - `packages/desktop/src/global.d.ts`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
  - `packages/desktop/src/renderer/styles.css`
  - `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`

## 已知约束（来自 design.md 的 D1-D5）

- D1：放开 `|`，仍拒绝 `<` `>` `` ` `` `$()` `{}`。
- D2：升级入口放在 `MoreHorizontal` 菜单。
- D3：`~/.actspace/bash-allowlist.json` 结构 `{ version: 1, entries: BashAllowlistEntry[] }`，仅写 `scope: "user"`。
- D4：preset 不删除，作为 `source: "preset"` 灌入 store。
- D5：session 作用域通过 `bash_allowlist_added` 事件持久化到 session.jsonl 并 replay。

## 风险

- 风险：放开 `|` 后，恶意命令更易构造 (`pnpm test | rm -rf ~`)。
  - 缓解：`splitForAuthorization` 拆段后，每个段单独走 hard reject 检查，`rm -rf ~` 仍被 `DELETE_COMMANDS` + `isCriticalPath` 拦截。
- 风险：renderer 直接读写 `bash-allowlist.json` 绕过 main。
  - 缓解：renderer 不暴露文件系统能力；所有 promote/list 通过 IPC `allowlist:promote` 等通道。
- 风险：session.jsonl replay 时事件顺序错位导致 allowlist 错乱。
  - 缓解：`bash_allowlist_added` 事件携带绝对 timestamp，replay 时按 timestamp 排序；store 在 replay 入口做去重。
- 风险：用户在 Allow dropdown 选 0 个 prefix 还按"Add to Allowlist and Run"。
  - 缓解：UI 在 prefix 为空时退化为 `approve_once` 行为，文案改为"Run only this time"。

## 核心改造按代码位置组织

### 1. 共享契约（packages/shared）

`packages/shared/src/session.ts`：

- 新增 `BashAllowlistEntry`、`BashExecutionPolicy`（仅类型占位，Phase 1 不消费）、`BashAllowlistStore` 接口。
- `SessionEvent` 新增 `{ type: "bash_allowlist_added"; entry: BashAllowlistEntry }`。
- `RuntimeStreamEvent` 的 `tool_approval_required` 新增 `prefixOptions: string[]`。

`packages/shared/src/ipc.ts`：

- `ApprovalDecideInput` 升级：`{ decision: "allow_similar"; allowPrefixes: string[] }`。
- 新增 IPC 通道类型：
  - `AllowlistPromoteInput = { prefix: string }`
  - `AllowlistListResult = { session: BashAllowlistEntry[]; user: BashAllowlistEntry[] }`

### 2. agent-core

`packages/agent-core/src/tools/tools/bash/split-for-authorization.ts`：新增。

- 输入：完整 command 字符串。
- 输出：去重后的前缀数组，按命令出现顺序排列。
- 规则：
  - 用 `&&` / `;` / `|` 拆段。
  - 每段取首词；若首词为 `pnpm` 且第二词为 `--filter`，则前缀为 `pnpm --filter`；其它情况前缀为 `<首词>`。
  - 黑名单首词（`rm`、`eval` 等）不出现在 prefixOptions 中。
- 单测：覆盖 `pnpm test`、`pnpm --filter foo run test`、`pnpm test | tail -15`、`git status && pnpm typecheck`、`rm -rf node_modules` 应被过滤。

`packages/agent-core/src/tools/tools/bash/allowlist-store.ts`：新增。

- `createInMemoryStore(presets: string[]): BashAllowlistStore`。
- `matches(segment)` 按 prefix 字面前缀匹配（不区分大小写？保持区分，因为 shell 区分大小写）。
- `add(entry)` 写入 in-memory map，key 为 `prefix`，按 scope 分桶。
- `promote(prefix)` 把 session 桶里的条目 clone 一份到 user 桶，并触发持久化回调（持久化回调由 main 注入）。
- `listSession(sessionId)` / `listUser()`。
- 单测：matches preset、matches session、promote 后 listUser 出现、replay 去重。

`packages/agent-core/src/tools/tools/bash/permissions.ts`：

- `UNSUPPORTED_SHELL_SYNTAX_RE` 改为 `/[<>` + "`" + `$(){}]/`（去掉 `|`）。
- `splitCommandSegments` 支持 `|` 分段（与 `&&` / `;` 共用）。
- `createBashPermissionChecker(workspaceRoot, store)` 注入 store。
- `classifyCommand` 内查询顺序：store.matches 优先于 `isAllowedDevelopmentCommand`。
- 删除 `ACTSPACE_BASH_ALWAYS_ASK` 对动态 store 的影响保持不变（这是调试开关，强制 ask）。
- 单测扩展：管道命令通过 hard reject、`pnpm test | rm -rf ~` 被段级 reject、preset 通过、动态 allow 通过。

`packages/agent-core/src/tools/scheduler.ts`：

- 第 174 行附近拆开 `approve_once` 与 `allow_similar` 分支。
- `allow_similar` 分支：从 `decision.allowPrefixes ?? []` 取数组，调 `bashAllowlistStore.add` （store 通过 `ToolSchedulerConfig` 注入），然后执行 handler。
- `ToolApprovalRequest` 新增 `prefixOptions`，来源于 `splitForAuthorization(args.command)`。仅 bash 工具生成；其它工具仍为 `[]`。
- `ToolApprovalDecision` 新增 `allowPrefixes?: string[]`。
- 单测 `scheduler-approval.test.ts` 扩展：`allow_similar` + `allowPrefixes=["foo"]` → store.add 被调用一次。

`packages/agent-core/src/engine/create-agent-deps.ts`：

- `buildAgentConfig` 新增 `bashAllowlistStore` 与 `bashAllowlistPersistCallback`，向下传递到 ToolManager。

`packages/agent-core/src/engine/bridge.ts`：

- `tool_approval_required` 事件 mapping 时把 `prefixOptions` 透出。
- session 持久化模块新增 `bash_allowlist_added` 事件写入与 replay。

### 3. main 进程（packages/desktop/src/main）

`packages/desktop/src/main/user-config.ts`：新增。

- `readBashAllowlist(): BashAllowlistEntry[]` / `writeBashAllowlist(entries: BashAllowlistEntry[])`。
- 路径 `path.join(app.getPath("home"), ".actspace", "bash-allowlist.json")`。
- 文件不存在 → 返回空数组。
- 写入用原子写（`fs.writeFileSync(tmp); fs.renameSync(tmp, target)`），避免半写文件。

`packages/desktop/src/main/index.ts`：

- 启动时读 user allowlist，构造 main 进程持有的 `BashAllowlistStore`（实际是 wrapper：内部维护 in-memory，promote 时调 `writeBashAllowlist`）。
- 注册 IPC：`allowlist:promote`（输入 `{ prefix }`）、`allowlist:list`（返回 session + user）。

`packages/desktop/src/main/agent-turn.ts`：

- 把 main 持有的 store 注入到 `buildAgentConfig`。
- session 加载时按 session.jsonl 的 `bash_allowlist_added` 事件 replay 到 store（仅 session 桶）。

`packages/desktop/src/main/approval-registry.ts`：

- `decide` 签名扩展：`decide(requestId, decision, allowPrefixes?)`，把 `allowPrefixes` 透传到 `ToolApprovalDecision`。

### 4. preload / renderer

`packages/desktop/src/preload/index.ts` 与 `packages/desktop/src/global.d.ts`：

- 暴露 `promoteAllowlist(input: AllowlistPromoteInput)` 与 `listAllowlist(): Promise<AllowlistListResult>`。
- `submitApproval` 升级签名：可携带 `allowPrefixes`。

`packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`：

- `BashApprovalBlock` 改造：
  - 计算 `availablePrefixes = message.prefixOptions ?? []`。
  - "Allow" 按钮变为 dropdown 触发器（点击展开 popover）。
  - Popover 内：每个 prefix 一个 `<input type="checkbox" defaultChecked>`，下方主按钮 "Add to Allowlist and Run"。
  - 提交时调 `submitApproval(requestId, { decision: "allow_similar", allowPrefixes: selectedPrefixes })`。
  - 当 `availablePrefixes` 为空时，dropdown 退化为单按钮"Run only this time"，决策为 `approve_once`。
- 右上角 `MoreHorizontal` (`⋯`) 菜单：列出每个 prefix 的"添加到用户 allowlist"项，点击调 `promoteAllowlist`。

`packages/desktop/src/renderer/App.tsx`：

- `ToolEntry` 加 `prefixOptions?: string[]`。
- `handleStreamEvent` 的 `tool_approval_required` case 写入 `tool.prefixOptions = event.prefixOptions`。
- `toolEntryToBlock` 的 bash 分支透传 `prefixOptions`。

`packages/desktop/src/renderer/styles.css`：

- 新增 `.bash-allow-popover` 系列样式：popover 容器、checkbox 行、主按钮 hover/disabled 态。

`packages/desktop/src/renderer/fixtures/workbenchFixture.ts`：

- 给 `mock-bash-approval` 加 `prefixOptions: ["pnpm --filter", "tail"]` 之类。

## 任务粒度（按执行顺序）

1. **共享契约**
   - 文件：`packages/shared/src/session.ts`、`packages/shared/src/ipc.ts`。
   - 验证：`pnpm --filter @actspace/shared build` 通过。

2. **`splitForAuthorization` + 单测**
   - 文件：`packages/agent-core/src/tools/tools/bash/split-for-authorization.ts` 与对应测试。
   - 验证：`pnpm --filter @actspace/agent-core test` 通过新测试。

3. **`BashAllowlistStore` 内存实现 + 单测**
   - 文件：`allowlist-store.ts` + 测试。
   - 验证：测试覆盖 preset / session / user / promote / replay-dedup。

4. **`permissions.ts` 改造**
   - 文件：上文路径。
   - 验证：现有 `bash.test.ts` 通过 + 新增管道/段级 reject 测试通过。

5. **`scheduler.ts` 拆分 allow_similar 分支**
   - 文件：上文路径。
   - 验证：`scheduler-approval.test.ts` 通过 + 新增 store.add 调用断言。

6. **engine 注入 + bridge 透出 prefixOptions**
   - 文件：`create-agent-deps.ts`、`bridge.ts`。
   - 验证：`pnpm --filter @actspace/agent-core test` 全绿；`pnpm typecheck` 全绿。

7. **main: user-config + IPC 通道**
   - 文件：`user-config.ts`、`main/index.ts`、`main/agent-turn.ts`、`approval-registry.ts`。
   - 验证：`pnpm typecheck` 全绿；手动构造一个 `bash-allowlist.json` 读出来正确。

8. **preload + global.d.ts**
   - 文件：上文路径。
   - 验证：`pnpm typecheck` 全绿。

9. **renderer: BashApprovalBlock dropdown + promote 菜单**
   - 文件：上文路径。
   - 验证：`pnpm --filter @actspace/desktop test` 通过；浏览器 mock 看到 dropdown 与菜单。

10. **fixture 与样式**
    - 文件：`workbenchFixture.ts`、`styles.css`。
    - 验证：浏览器 mock 渲染正确。

11. **session.jsonl 事件流 + replay**
    - 文件：`bridge.ts` 或对应 session 模块。
    - 验证：手动重启会话后 store 状态保留；新增 replay 单测。

12. **手动验收**
    - 步骤：
      1. 开 `pnpm dev:log`，触发一个非 preset 命令进入审核。
      2. 选择保留某个 prefix，点 "Add to Allowlist and Run"。
      3. 再触发以该 prefix 起头的命令，应自动放行。
      4. 切换会话，应再次询问。
      5. 在 `⋯` 菜单点"添加到用户 allowlist"，重启应用后该 prefix 仍生效。
      6. `~/.actspace/bash-allowlist.json` 内容与 D3 一致。

## 里程碑

1. M1：共享契约 + `splitForAuthorization` + store 单测通过。
2. M2：permissions / scheduler 改造完成，scheduler-approval 测试全绿。
3. M3：main 持久化与 IPC 通过，typecheck 全绿。
4. M4：renderer dropdown + promote 菜单完成，desktop 测试与浏览器 mock 通过。
5. M5：session.jsonl 事件流 + replay 完成，手动验收清单全部通过。
6. M6：history 落档，README 索引更新。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/agent-core build`
  - `pnpm typecheck`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/desktop test`
- 手工检查：见上文 M5 手动验收清单。
- 观测检查：浏览器 mock fixture 中能看到 dropdown 与 promote 菜单视觉。

## 进度记录

- [ ] 共享契约：`BashAllowlistEntry` / `BashAllowlistStore` / IPC 类型。
- [ ] `splitForAuthorization` 实现 + 单测。
- [ ] `BashAllowlistStore` 内存实现 + 单测。
- [ ] `permissions.ts` 改造（管道分段 + store 查询）。
- [ ] `scheduler.ts` 拆分 allow_similar 分支 + 测试。
- [ ] engine 注入 + bridge prefixOptions 透出。
- [ ] main user-config + 持久化 + IPC。
- [ ] preload + global.d.ts。
- [ ] renderer BashApprovalBlock dropdown。
- [ ] renderer promote 菜单。
- [ ] fixture + 样式。
- [ ] session.jsonl 事件 + replay。
- [ ] 手动验收清单全部通过。
- [ ] history 落档 + README 索引更新。

## 决策记录

- 2026-05-26：放开 `|` 进入 `splitForAuthorization`，仍拒绝 `<` `>` `` ` `` `$()` `{}`。理由：管道是开发命令高频形态，拒绝它等于关闭 Cursor 风格的命令拆分入口；其它字符仍有注入风险。
- 2026-05-26：升级到用户配置的入口放在 `MoreHorizontal` 菜单内。理由：主操作区已经有 Skip / Allow / Run 三个按钮，再加按钮会让审核面板视觉爆炸。
- 2026-05-26：preset 不删除，迁移为 store 在初始化时灌入的 `source: "preset"` 条目。理由：保留源码 audit，运行时只看 store。
- 2026-05-26：scope=session 的 allowlist 不写用户配置；scope=user 必须用户显式触发 promote。理由：避免静默学习用户行为带来的隐私问题。
