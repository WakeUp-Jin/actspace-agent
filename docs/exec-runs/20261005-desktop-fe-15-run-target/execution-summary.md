# 15 运行目标 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/15-运行目标执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-15-run-target/execution-process.md`
- **现行规范**：`docs/design-docs/frontend/front-workspace-git-worktree-context.md`「运行目标（本机与远端）」
- **执行模式**：交互，连续执行
- **执行结果**：完成。T0–T15 全部完成，另有一个复核修复提交。中途暂停一次（`pauses.md` P1，readiness 新增 `host-unavailable`，你选了方案 A）。
  - 界面大体不变，远端的 3 个 `<select>` 保留到 09。
  - 可感知的变化有三类：
    - 远端未就绪时说明具体原因，不再是笼统的「Host 未就绪」；
    - 新建页按 Host 记住上次的模型；
    - 远端会话切走再切回，模型和工作区不变。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 会话定位（T1、T2） | `S/session-locator.ts`、`R/target/locate-session.ts` | `host:` key 的编解码只有 shared 一份，严格校验并做 round-trip 检查；renderer 返回 `local` / `remote` / `invalid`，损坏的 key 显示错误态，不白屏。业务代码里的 `startsWith("host:")` 清零 |
| HostDirectory（T3、T4） | `R/target/host-directory.ts`，以及 App、ApprovalParts、HostConnectionsSettings | 整个窗口只 list 一次、只订阅一次；每次连接 describe 一次，失败原因可见（复核后改为失败的下次重试）；Host 被移除时 evict 它的会话 |
| RunTarget（T5、T6） | `R/target/run-target.ts`、`use-run-target.ts`、`run-target-context.tsx`，WorkbenchLayout、ConversationView、TurnOutputArtifacts、Composer | 「是不是远端」统一看 `target.kind`，入口显隐看 `capabilities`；WorkbenchLayout 的 prop 13 → 9，ConversationView 15 → 9 |
| 远端会话记录（T5、T8） | `R/target/remote-session-prefs.ts`、`use-model-catalog.ts` | 工作区和模型记在 `actspace:remote-session-prefs`；新建页按 Host 记模型；旧的 `actspace:remote-models` 启动时迁移后删除 |
| readiness（T7） | `R/target/readiness.ts`、Composer、App | 11 种状态，每种都有文案；只有 `ready` 能发送，未就绪时发送按钮说明原因，草稿保留 |
| gateway（T9、T12） | `M/session-gateway.ts`、`R/session/session-gateway.ts` | main 侧的本机 / 远端分流搬出 `fixed-renderer-ipc`；renderer 侧的建会话和提交从 App 搬出，可以单测。App.tsx 1565 → 1549 行 |
| 审批 hostId（T10、T11） | `S/session.ts`、`S/ipc.ts`、`desktop-adapter.ts`、`ApprovalParts.tsx` | 事件和待审批列表都带 `hostId`，按 `hostId` 路由；renderer 不再拆 id 字符串；Host 对不上时拒绝 |
| run-git（T13） | `M/git/run-git.ts`，以及 3 个 git service | git 子进程统一走一个入口（`-C`、`GIT_TERMINAL_PROMPT=0`、超时、截断、启动错误）；`review-pr-service` 语义不同，不并入 |
| 删除 `useRemoteTarget`（T14） | `use-run-target.ts`、Composer、App | 远端选择由 `RunTargetState.choices` 提供 |
| 文档（T15） | 规范新章节、03 §6 更正 10 条、Host 指南链接、README | — |
| 复核修复 | `host-directory.ts`、`remote-session-prefs.ts` | describe 失败后下次列表变化时重试；记录的工作区 id 在 Host 上没有时按路径找回 |

## 偏差

- **T1**：base64url 和 UTF-8 编码都是手写的。shared 没有 DOM / Node 类型，用不了 `TextEncoder`。与 `Buffer` 的结果逐字节比对一致。
- **T4**：Host 列表读取失败时，远端会话不补齐。原来会照常发请求，大概率也是失败。
- **T5**：`RunTarget` 多了第三种 `invalid`，对应损坏的 key。T6 的「删除路径反查」提前到这里做了。
- **T6-3**：Composer 的工作区和 Git prop 没有移进 Context，等 16 拆 Composer 时再收。
- **T7**：新增第 11 种 readiness `host-unavailable`（`pauses.md` P1，你选了方案 A）。
- **T11**：审批的 Host 取自当前会话的 RunTarget，没有把 `hostId` 逐层加进消息块。
- **T13**：`review-pr-service` 不并入 run-git，理由见执行过程。
- **插曲**：根目录 `.gitignore` 的 `target/` 吞掉了 `renderer/target/`，T2–T4 的新文件当时没进提交，后来单独补交（`3959463d`）。squash 后主线不受影响。
- **history 补建**：计划开始时漏建 history 文件，收尾时补上。

## 人工验证指引

### 必须验证

1. **真实远端 Host 下新建会话**
   - 验证方式：
     - 连一台 Host，在新建页选它；
     - 换工作区和模型后发送；
     - 再新建一次，看是否仍是上次的模型。
   - 预期结果：
     - 工作区和模型列表来自这台 Host；
     - 发送后建出远端会话，进入后 select 锁定，显示刚才的选择；
     - 再新建时模型默认是上次选的。
2. **远端审批**
   - 验证方式：在远端会话里触发一次需要审批的工具调用，批准。
   - 预期结果：批准后继续运行，侧栏的待审批标记消失。
3. **切换远端会话**
   - 验证方式：两个远端会话用不同模型，来回切换。
   - 预期结果：各自的模型不变。
4. **断开 Host**
   - 验证方式：停掉 Host 或断网。
   - 预期结果：会话显示「远端 · 未连接」，发送按钮说明原因，草稿保留。

### 建议验证

- Host 正在停止或恢复出错时（`draining` / `blocked`），新建页的说明文案。
- 打开一个非 Git 目录、一个刚 `git init` 的目录、一个正常仓库，看分支控件。

## Agent 已完成的验证

- typecheck：desktop 0 错误。
- 测试：
  - desktop：文件 168 通过 / 2 失败 / 1 跳过，用例 1279 / 2 / 2。失败的是：
    - 基线中已知的 `workspace-git-context-service`；
    - T6-2 记下的 composer 偶发用例，单独跑 70 个用例全过。
  - 与 14 结束时相比，多 11 个测试文件，多 118 个用例。
  - shared 163 个用例通过。
- 脚本检查：`check:renderer-bridge`、`check:ipc-channels`、`check:frontend-tokens`、`check:current-docs` 通过。
- 变异验证：每个 T 的关键判断都做了变异，存活的都已核实为等价变异并写明理由（详见执行过程各 T）。复核修复 6 个变异，5 个有用例失败，存活的那个判断确实多余，已删除。
- 浏览器 mock（`?mock=remote-host`，注入假的 `host.describe`）：
  - 新建页选 Host、换工作区和模型、发送建会话、切到本机会话再切回，都通过；
  - `blocked`、`draining`、describe 失败三种未就绪状态，文案正确、发送禁用、点击无效。
- Electron（临时数据目录）：
  - 没有 Host 时只有本机，页面无报错；
  - 非仓库、无 HEAD、正常仓库三种 git 状态的分支控件都正确。
- Sonnet 只读复核：没有发现高、中严重度的确定缺陷。6 条存疑中 3 条属实，已修复；其余 3 条不改，理由见执行过程「复核处理」。

## 已知风险和遗留事项

- **已修复（验收反馈第 1 轮，`7154f57d`）**：中文系统下 git 的报错是中文，git-context 原来判断不出「不是 Git 仓库」，结果是 `failed`。按你选的方案 B，只在判断仓库的那一次调用上固定 `LC_ALL=C`。修复后 desktop 全量测试没有失败用例。
- **mock 预置会话的路径对不上**：mock 预置的远端会话，路径与 Host 的工作区对不上。这时文案是「选择一个远端工作区」，但 select 已锁定。基线同样如此，留给 09 的新菜单处理。
- **取消归档后模型回到默认**：会话被 evict 时删除 prefs，这是决策记录里定的。因此取消归档后，会话的模型回到该 Host 新建页的选择，工作区能按路径找回。
- **composer 偶发用例**：`composer.test.tsx`「opens a card listing selected text and comments」在全量满载时偶尔超时，与本计划无关。
- 学习文档：`docs/learnings/2026-10/20261006-cli-output-locale.md`。

## 后续建议

- 进入 16（UI 原语与组件拆分）。T6-3 留下的 Composer 工作区和 Git prop 在拆 Composer 时收进 Context。
