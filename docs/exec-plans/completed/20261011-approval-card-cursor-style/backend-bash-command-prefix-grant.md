# Bash 命令前缀会话授权：设计与执行方案

日期：2026-10-11
状态：用户已批准并完成实现；自动化及浏览器结果见执行摘要，真实 Electron 后端链路验收待完成。
执行模式：交互模式。用户要求先交付完整方案；实现须等明确的执行指令。
关联：[审批卡 D 方向](README.md)。本文件替换原后端草案，作为本功能的唯一实施入口。

## 1. 目标与成功标准

用户首次批准 `pnpm test` 时，可选择「本会话允许 pnpm」。同一会话、同一 Agent、同一工作区内，后续符合规则的 `pnpm build` 不再弹审批卡。`git status` 只授权 `git status`，不覆盖 `git diff` 或 `git push`。

成功标准：

- 现有「拒绝」「运行」行为保留；单次运行不创建会话授权。
- 前缀建议由后端生成，用户点击后才写入授权；前端不自行授予权限。
- 每次调用先经过已有硬拒绝，再判断是否可复用授权；拒绝优先。
- 复杂命令、不支持的命令、参数排除项和显式 `no_sandbox` 不复用前缀授权。
- 同一会话恢复后授权可继续使用；跨会话、fork、子 Agent 不继承可用授权。
- 撤销、策略版本变化、工作区变化后不自动放行；文件授权不回归。
- 自动放行可以通过 Journal 追溯，真实 Electron 验收与 mock/单测分别记录。

## 2. 已有能力与本次增量

### 2.1 当前事实

- `packages/tools/shell-tools/src/command-rules.ts` 已有字符检查、按分号分段、处理引号和反斜杠的简单分词，以及部分 builtin、删除路径和 `.git` 检查。
- `|`、`||`、重定向和展开相关字符当前已被硬拒绝；`&&`、`&`、换行未完整分段检查。不能把这些统一描述成「都没有检查」。
- `plugin.ts` 先执行硬拒绝检查，未拒绝的 Bash 返回 ask。目前没有 Bash 的 grant audience 或建议。
- 通用 Runtime 已有文件 Session Grant、审批记录、资源复验、撤销与恢复链路。
- `node-ports.ts` 启动进程前已有 cwd 词法和 realpath 边界检查。cwd 检查不是命令文件访问隔离。
- 执行器已有 macOS 沙箱尝试，探测失败回退真实环境；网络默认放行。本轮不改变这些行为。

### 2.2 本次做什么

扩展现有 Session Grant，让符合明确规则的 Bash 调用可以消费用户此前的批准。新增简单命令授权分析，不替换 Bash 执行器或完整安全检查系统。

### 2.3 明确不做

- 不设计、加强或关闭沙箱，不新增 sandbox Host capability，不改变探测失败回退。
- 不引入 AST / tree-sitter / wrapper 去壳，不把复杂命令逐段自动授权。
- 不修改已有硬拒绝函数的语义；已有 `&&` 等检查缺口单独记录，不能因本轮授权而自动放行这些结构。
- 不做永久、跨项目、跨会话授权，不新增用户可配置规则文件、设置开关或授权管理页面。
- 不启用 CLI、独立远端 Host 或子 Agent 的新授权能力；透传契约保持兼容。
- 不重做审批卡样式、快捷键、Bash 执行环境展示或其他工具 UI。
- 不处理上下文引擎、packages 清理和其他并行变更；不提交或推送代码。

规范变化：`docs/SECURITY.md` 当前规定 Bash「始终要求一次性批准」。用户已确认增加显式会话授权，实现时同步改为「默认单次批准；用户可对符合条件的命令前缀授权」，不提前把规划写成已实现事实。

## 3. 产品行为和授权边界

### 3.1 用户选择

- 「运行」：仅执行本次，不保存 Grant。
- 「本会话允许 pnpm」：保存 Grant，并执行本次；后续每条命令仍重新判断规则。
- 「拒绝」：不执行，不创建 Grant，也不撤销已有 Grant。
- 没有合法建议时隐藏会话按钮，保留单次按钮。
- 按钮仍用现有 D 方向组件。tooltip 为「允许当前会话在当前工作区内运行符合规则的 pnpm 命令，包括项目脚本；执行环境沿用现有设置」。Git 替换对应前缀。

「本会话」指持久会话，不是当前进程：重启应用并恢复同一会话仍有效。现有 revokeGrant API 可撤销；当前 renderer 未发现实际授权管理入口，本轮不宣称已有设置页可撤销。

### 3.2 授权范围

同时绑定 sessionId、agentId、audience、policyVersion 和 workspace 的 realpath 根目录。仅 Desktop 本机主 Agent 启用。

- 工作区不同子目录可以复用。
- 当前 workspace realpath 必须与 Grant.cwdRoot 相等；不仅检查 cwd 包含关系，避免切换到旧工作区的子目录后继续消费旧授权。
- cwd 必须在当前 workspace realpath 内，且每次重新解析。
- workspace 改变时撤销该会话现有 process Grant，避免切回后意外恢复旧授权；文件 Grant 沿用原规则。
- 权限模式 default/full-access 不改变 Bash 授权；模式降级只保留原文件 Grant 回收语义。
- 已启动的进程不会因撤销 Grant 自动终止；撤销影响后续调用及执行前复验。

### 3.3 沙箱决定

不检测沙箱是否实际可用作为授权条件；显式携带 `requiredPermissions: ["no_sandbox"]` 的调用不给建议、不复用 Grant。该条件只排除主动绕过请求，不保证其余调用一定在沙箱内。

本方案的前提：用户选择程序级前缀意味着允许该程序执行项目脚本。脚本内容、插件、PATH 或 shell 登录配置可以影响真实行为；Grant 不绑定可执行文件哈希或脚本内容。白名单不是「已证明无副作用」的列表，cwd 范围不是文件访问边界。

## 4. 首版命令规则

由 shell-tools 维护一个纯函数 `analyzeCommandPrefixGrant`，建议与复用均使用相同分析结果，不在通用 Runtime 复制命令白名单。

### 4.1 简单命令准入

仅解析一个外部命令及其字面参数，不执行 shell 展开。

- 控制字符、特殊 Unicode 空白按现有检查排除。
- 原文含以下字符则不适合前缀授权，包括出现在引号内：分号、&、管道符、尖括号、反引号、美元符、圆括号、花括号、感叹号、换行、回车、反斜杠、波浪号、星号、问号、方括号、井号。
- 普通空格、Tab 和字面单双引号参数可以支持；引号必须闭合，空字符串参数必须保留，不复用现有分词器会丢空参数的行为。
- 命令首词必须是裸写的白名单名称；带路径、引用或转义的命令名、环境变量赋值前缀、包装命令均不适合授权。
- git 子命令同样必须裸写且紧跟 `git`；`git -C ... status`、`git -c ... status` 不提供建议。
- 无法确定语义时返回无授权候选，继续走已有规则和单次审批，不新增硬拒绝。
- 授权分析只产出供本轮权限判断使用的结构；最终执行仍使用原始 command 字符串。

### 4.2 前缀白名单

| 命令 | 保存前缀 | 范围 |
| --- | --- | --- |
| pnpm、npm、yarn、cargo、go、make、tsc、vitest、eslint、prettier | 一个 token | 符合规则的该程序调用，包括项目脚本 |
| git status、git diff、git log、git show | 两个 token | 同一个 git 子命令 |

不包含 ls/cat/echo 等额外读工具；不包含 rm、sudo、解释器、网络 CLI 等。首版保持固定列表，不提供自定义配置。

### 4.3 参数排除规则

为了不引入完整的各 CLI 参数解析器，首版采用保守 token 扫描。以下任一条件成立就无授权候选；即使 token 是脚本参数也可能触发询问。

- pnpm：后续 token 精确命中 `dlx / exec / publish / login / config`。
- npm：后续 token 精确命中 `exec / x / publish / login / config`。
- yarn：后续 token 精确命中 `dlx / exec / publish / login / config`（覆盖 yarn npm publish）。
- 三种包管理器任一参数是 `-g`、`--global` 或 `--global=...`；短参数聚合或未知前置短参数不尝试还原，保守不给建议。
- 所有命令：参数为 `--prefix`、`--userconfig`、`--registry` 或对应 `=...` 形式。
- pnpm/npm/yarn 第一个参数如果以 `-` 开头，仅放行精确的 `-v / --version / -h / --help`；其他前置 option 形式先单次询问。因此 `pnpm --filter ... test` 首版不复用授权，可用各子目录 cwd 执行。
- git：排除 `--output` 及 `--output=...`，避免把写文件选项归为只读建议；不宣称 git 配置、pager、diff helper 因此被隔离。

以上是减少自动批准范围的产品规则，不是完整安全分类器。允许的程序仍能运行代码、读写文件和联网。扩展或收紧规则均提升 Bash audience.policyVersion，让旧授权失效。

## 5. 数据链路与契约

```text
shell-tools：原始 args → 现有硬拒绝 + 当前可授权前缀 + canonical cwd/root
    ↓
tools-runtime：合并权限 → 匹配已有 Grant 或生成审批请求
    ↓                                           ↑
Desktop broker → 审批卡 → once/session/deny ------┘
    ↓
Journal：asked / decided / grant-added / grant-used / grant-revoked
    ↓
Session projection → 当前有效 Grant → 下一次 tools-runtime 调用
```

### 5.1 shared

`packages/shared/src/runtime-v2/permission.ts`：

- GrantAction 增加 process.execute；GrantAccess 增加 execute。
- 保留 FileGrantSelector，新增 CommandPrefixGrantSelector：kind=command_prefix、prefix 为 1–2 个 token、cwdRoot 为规范化绝对路径。
- SessionGrant 和 GrantSuggestion 使用扩展后的 GrantSelector；action/access/selector 必须成组匹配，file 不能配 command_prefix，process 不能配 exact/subtree。
- prefix token 仅接受 1–64 字符的 ASCII 字母数字及 `._@+-`；允许的具体程序由 shell-tools 决定。
- IPC 提交仍为 requestId + session decision + suggestionId；不新增 channel。

### 5.2 process 资源

`packages/tools/runtime/src/permission/types.ts` 的 process 资源保留 commandDigest/cwd/dynamic，新增：

- argv：可选，只在严格简单解析成功后提供。
- grantPrefix：可选，仅通过白名单和参数排除后提供。
- workspaceRoot：本次 realpath 工作区根。
- noSandbox：是否显式请求 no_sandbox。

这些字段由受信任工具权限合约计算，不能让模型直接提供。argv 仅用于内存匹配和资源复验，不加入 ApprovalResourceSummary、tooltip 或新增审计事件。canonical 路径失败时不生成可授权资源，当前调用失败且不启动进程，不伪造 realpath。

### 5.3 Runtime 的授权判断

- ToolPermissionDecision.ask 增加可选 reusable；缺省 false，只有可授权 Bash 调用设 true。
- combinePermissionDecisions 透传 reusable，不改变 deny 优先级。
- 保留文件 global-ask + tool-allow 路径；新增 global-pass + tool-ask + reusable 的 process 路径。
- 必须有 sessionGrantCapability 且 audience 受信任；Bash audience 为 pluginId=actspace.shell-tools、permissionDomain=bash、policyVersion=1。
- 匹配时验证 session/agent/audience/version/expiry、action/access、严格 token 前缀、当前 grantPrefix 与 Grant.prefix 完全相同、当前 workspaceRoot 与 cwdRoot 相同、cwd 在根内、noSandbox=false。
- draft 校验也执行相同 process 约束；资源必须恰好一个 process，不能混入文件或空资源，不使用字符串 startsWith。
- #recheck 重算资源和授权覆盖；Grant 撤销或资源变化时阻止执行。当前授权分析产生的 grantPrefix 也是复验数据的一部分。
- 刚批准的 Grant 必须已经追加到 Journal 并可被 sessionGrants getter 读取，再复验并启动；不能仅凭 UI 成功返回就执行。
- 未命中不等于 deny：回到原一次性审批。审批失败、过期、错 suggestionId 均不生成可用 Grant。

### 5.4 审计

新增 `permission/grant-used`，不伪造不存在的 approval requestId。

事件字段：schemaVersion=1、grantId、sessionId、agentId、callId、pluginId、toolName、commandDigest、usedAt。无完整 argv、无原始命令和敏感参数。

仅对 process Grant 在复验成功、执行准入时记录（包括首次 session 批准后的准入）；随后由原 dispatch/result 记录实际运行结果。该事件表示授权准入，不证明进程执行成功。审计追加失败则不得启动。匹配器返回实际选中的 grantId，多个匹配时按 issuedAt、grantId 稳定排序选一个。

同步 ToolJournalPort 事件联合、Journal core codec 事件注册及校验；Agent Loop 的 recordPermission 透传路径补覆盖测试。无需新增审计页面或恢复日志行“本会话已授权”标记。

## 6. 恢复、撤销与 Host 范围

- Journal codec 校验新 selector 和 grant-used；projection 只接受合法 action/access/selector，非法 Grant 不进入有效集合。
- 同一会话恢复复用；fork 中即使复制事件，sessionId/agentId 仍必须匹配，不重写旧 Grant 使其可用。
- updateSessionPermissionMode 仅按路径处理 file Grant，不能把 process selector 当 subtree。
- updateSessionWorkspace 在同一批追加中撤销现有 process Grant 并更新 workspace；即使遗漏撤销，workspaceRoot 等值检查仍应阻止跨工作区复用。
- revokeSessionGrant 沿用现有接口。撤销后的下一次调用需审批；在途执行不追溯终止。
- Desktop 本机主 Agent 的 trustedGrantAudiences 加入 Bash。子 Agent 不启用新能力；测试验证环境构造不会意外继承。
- CLI、独立远端 Host 不新增 capability 或受信任 audience。Host/remote broker 只做格式透传兼容测试，不宣称远端功能启用或完成实机验收。

## 7. 文件范围与实施顺序

预计超过 8 个生产文件及多包测试，属于跨层权限功能；不新增服务、依赖、配置项或外部账户。以下为同一交付单元中的有序工作项，全部门禁通过后才交付，不把中间半成品当独立可发布阶段。

实现前必读：AGENTS.md、REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、SECURITY、CODING_BEHAVIOR、agent-plugin-runtime/agent-testing、前端新功能开发清单、FRONTEND_VERIFICATION、HISTORY_GUIDE、QUALITY_SCORE。

| 顺序 | 文件 | 具体动作 |
| --- | --- | --- |
| 1 | shared/src/runtime-v2/permission.ts；session/journal/src/core-codecs.ts；session/projection/src/facts.ts | 增加契约、严格组合校验、审计事件和恢复支持；补 codec/projection 测试 |
| 2 | tools/shell-tools/src/command-rules.ts；新增同目录 command-prefix.ts；plugin.ts | 保留原硬拒绝；新文件独立实现严格授权分析，plugin 使用 realpath 资源、audience、reusable 和 suggestGrants |
| 3 | tools/runtime/src/permission/{types,engine,grants}.ts；prepared-execution.ts | 扩展资源与匹配、草稿校验、process 放行、复验和审计；不反向依赖 shell-tools |
| 4 | agent-service/src/application.ts；desktop main/runtime-v2/desktop-host-adapter.ts | workspace 回收、模式切换兼容、主 Agent audience；验证其他 Host 和子 Agent 边界 |
| 5 | desktop renderer/components/messages/ApprovalParts.tsx、BashRunBlock.tsx；相关 mock/tests | 删除 unknown 过渡转换，正式类型窄化；防止 requestId 变化残留旧 suggestion；测试 session 按钮和提交失败 |
| 6 | core/agent-loop/src/loop.ts 相关测试；runtime/src/harness 相关测试；Host/desktop broker 测试 | 验证真实 Journal 接线、session 恢复、fork/子 Agent 隔离和透传 |
| 7 | SECURITY、shell-tools/README、审批卡规范、当前计划及索引、contract matrix | 更新行为与边界，生成矩阵，记录真实验收结果 |

表中 packages 下路径省略 packages/，desktop 下路径省略 apps/desktop/src/。共享索引只在需要公开新类型时补 export。

开始实现时建立 `docs/exec-runs/20261011-bash-command-prefix-grant/` 的执行过程和摘要；history 单独记录本后端任务，避免覆盖前端历史。满足学习沉淀条件时按指南写权限复用边界说明。

## 8. 自动化验证矩阵

| 分类 | 必须覆盖 |
| --- | --- |
| 简单解析 | 空命令、空参数、闭合/未闭合引号、Tab、所有排除字符、环境赋值、路径命令、引用命令名、包装命令 |
| 命令规则 | 白名单每个条目、git 四个子命令、非白名单、pnpmx、子命令排除、选项独立及等号形式、前置选项、global 聚合参数、no_sandbox |
| 核心流程 | 第一次 session 批准并运行，第二次同前缀不问，不同前缀再问，once 不持久化，deny 不执行 |
| 复杂命令 | 已授权 pnpm 后，&&、&、分号、换行绝不自动放行；已有管道/展开拒绝仍拒绝；引号内复杂字符保守不授权 |
| 作用域 | workspace 根与子目录、同前缀兄弟目录、符号链接逃逸、realpath 失败、工作区切换及切回、不同 session/agent/audience/version、过期 |
| 复验 | 等待批准时 cwd/符号链接/资源变化、Grant 撤销、权限模式变化、audience 停用、首次 Grant 不可见、Journal 写失败均不执行 |
| 恢复 | Journal 保存后重新构建 session 与 Runtime，同一会话复用；fork、新会话、子 Agent 不继承 |
| 数据合法性 | 空或过长 prefix、3 token、非法字符、相对根目录、action/access/selector 错配、畸形 grant-used；现有文件 Grant 正反例继续通过 |
| 前端 | 正式建议显示按钮、session + suggestionId 正确提交、无建议隐藏、异步 requestId 切换清空旧建议、提交失败可重试 |
| 审计 | 每次自动准入关联实际 grantId 和 callId，参数不泄露；复验失败不写成功准入事实；执行失败仍能区分授权与执行结果 |
| Host | 本机启用；CLI/远端未启用时不签发/消费；broker 透传不改变 selector |

测试主位置：shell-tools/src/test/command-prefix.test.ts（新增）、lifecycle.test.ts；tools/runtime/src/test/{permission,runtime}.test.ts；session/journal/src/test/journal.test.ts；session/projection/src/test/facts.test.ts；agent-service 与 core/agent-loop 对应测试；desktop renderer/test/{approval-parts,bash-run-block-tooltip}.test.tsx 和 main/test 审批测试。

运行命令（仓库根，依赖构建优先；保留现有构建脚本）：

```bash
pnpm --filter @actspace/runtime... --filter @actspace/client... build
pnpm --filter ./packages/tools/shell-tools test
pnpm --filter ./packages/tools/runtime test
pnpm --filter ./packages/session/journal test
pnpm --filter ./packages/session/projection test
pnpm --filter ./packages/agent-service test
pnpm --filter ./packages/core/agent-loop test
pnpm --filter ./packages/runtime test
pnpm --filter ./packages/agent-host test
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm gen:contract-matrix
pnpm test:contract-matrix
pnpm check:packages
pnpm check:harness-events
pnpm test:harness-events
pnpm check:ipc-channels
pnpm check:renderer-bridge
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:current-docs
pnpm check:docs
```

检查必须通过或明确记录阻塞及归属；不得为了全绿改不相关上下文引擎/清理文件。旧的 1709 测试通过记录不能作为本功能证据。

## 9. Computer Use 验收

### 9.1 验收点

- A1：首次 pnpm 简单命令显示三个按钮和正确前缀；拒绝不执行，单次批准不留下授权。
- A2：点击会话允许后当前调用执行，再次同前缀真实调用不弹卡，不同程序仍询问。
- A3：git status 授权仅覆盖该子命令，git diff 仍需单独授权。
- A4：复合命令、参数排除项、显式 no_sandbox 不被已有 Grant 自动放行；对这类审批选择拒绝，不执行真实 publish/dlx 等动作。
- A5：浅色、深色、480px 窄窗下三个按钮、长前缀、tooltip、忙碌/失败状态可用；不与发送键冲突。
- A6：真实 Electron 重载 pending 卡保持可操作；重启恢复同一会话授权可复用，新会话不复用。
- A7：通过现有 revokeGrant API 撤销后 UI 再次询问；workspace 切换后授权不复用。API 操作单独标为运行时验证，界面反馈标为 Computer Use 验证。

### 9.2 操作分组

- 组一，浏览器 mock 审批场景：连续检查建议有无、提交状态、主题和窄窗，覆盖 A1 的展示部分和 A5；截图保留浅/深/窄窗关键状态。mock 不证明真实授权执行。
- 组二，真实 Electron 临时验收工作区：运行无副作用版本命令及临时 package 的 test/build 打印脚本，按拒绝→单次→会话授权→重复调用→不同前缀路线覆盖 A1–A4；保留审批截图、调用结果和对应 Journal seq。
- 组三，复用组二会话：pending 重载、重启、撤销、新会话及切换工作区，覆盖 A6–A7；保留关键前后状态及授权事件。不中断用户其他在途任务。

按用户 AGENTS 要求，实际 Computer Use 委派明确指定 gpt-6.1-sol 的子智能体，主智能体负责实现和修复；模型不可用则报告，不静默换模型。执行前给出验收点和路线，结果逐项标通过/失败/未覆盖。截图为本地证据，不随仓库分发。

开发与单测不需要新 API Key、服务或依赖。真实模型驱动 Electron 验收需要用户已经配置可用 provider；未配置时保留该项未覆盖，不能用 mock 宣称实机端到端通过，也不读取或输出凭据。

## 10. 风险、替代方案与回退

- 最大产品取舍是程序级授权较宽；pnpm 项目脚本、cargo build script、make 等可执行任意代码。用户已选择 pnpm 级便利性，本轮不改成 pnpm test 级；严格语法、cwd 和排除列表仅限制自动授权的直接调用。
- 首版保守规则会让带前置参数的 monorepo 命令仍弹窗，这是已知体验取舍；不在实现中临时扩展语法。
- 最小替代方案是只允许当前完整命令重复执行，可减少风险但不满足「允许 pnpm 后 build/test 共享」目标，因此不采用。
- 现有硬拒绝的复合命令、wrapper 等检查不足由后续 Bash 安全分析任务处理；本轮新增 Grant 不覆盖这些不确定输入。
- 首选功能回退：从 Desktop trustedGrantAudiences 移除 Bash，重建 Runtime；建议和消费同时停用，原审批保留。当前已启动进程不受影响。
- 规则错误时提升 policyVersion；旧 Grant 不再匹配，保留审计，不修改历史记录。
- 保留新 codec/projection 的读取兼容代码。完整降级到旧二进制对新 Journal 的行为必须有 fixture 验证，不能假定旧版本一定忽略；未经验证不承诺无损旧版回滚，不删除用户 Journal。
- 实现不使用全量暂存、重置、清理或覆盖工作区；按文件/补丁维护任务范围，特别留意已被其他任务改动的 application.ts、loop.ts 和生成矩阵。

## 11. 实施检查清单

- [x] 完成正式类型、codec/projection 与契约测试。
- [x] 完成 shell-tools 授权分析和规则表测试。
- [x] 完成 Runtime 签发、匹配、复验与审计。
- [x] 完成 Desktop 主 Agent 接线、workspace 回收与隔离测试。
- [x] 完成前端类型接通和建议刷新测试。
- [ ] 完成自动化验证及逐项 Computer Use 结果。
- [x] 同步安全规范、工具说明、前端规范、执行记录和 history；生成物按命令生成。

下一步：用户发出实现指令后，核对以上涉及文件的工作区漂移，按第 7 节顺序开始；本轮仅形成方案。

## 实现记录

2026-10-11 用户批准后已实现。自动化与界面验收证据、剩余门槛见 [执行摘要](../../../exec-runs/20261011-bash-command-prefix-grant/execution-summary.md)。
