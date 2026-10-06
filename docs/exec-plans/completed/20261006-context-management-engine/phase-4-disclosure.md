# P4：渐进式披露、原始历史访问与集成验收

状态：实现完成，自动化检查通过；真实模型/实机覆盖限制见执行摘要。依赖：P3；完成后交付本次第一版全部能力。先读[总计划](README.md)、[共享契约](shared-contracts.md)及[披露设计](../../../design-docs/上下文管理引擎设计/agent-progressive-disclosure.md)。本阶段不添加历史摘录、文件监听、检索模型或新的权限体系。

## 允许修改范围

- `packages/context/src/disclosure/{plugin,paths,policy,index}.ts`（新增），已有 engine/state/codec/supplements/compaction 与测试、manifest/exports。
- `packages/tools/filesystem-read/src/{node-ports,plugin}.ts`、`packages/tools/filesystem-write/src/node-ports.ts`、`packages/tools/shell-tools/src/node-ports.ts`：明确文件事实与压缩后缓存衔接；不猜测任意 shell 命令的读取行为。
- `packages/tools/runtime/src/`：只扩展现有工具上下文的读取 generation/结果 detail 接线及对应类型；不改审批决策和工具调度模型。
- `packages/core/agent-loop/src/loop.ts`：工具结果提交后的受等待事实交接，不使用 fire-and-forget tools/result 保存计数。
- `packages/runtime/src/harness/`、`startup/boot.ts`、`session/session-controller.ts`：披露行为、Host capability、恢复入口和手动操作接线。
- `packages/agent-host/src/{bootstrap,node-ports/tool-host-services}.ts`、`apps/cli/src/runtime-v2/{host,host-adapter}.ts`、`apps/desktop/src/main/runtime-v2/{desktop-host-adapter,tool-host-services}.ts`：原始历史与 artifact 能力接入，沿用已有 Session scope 及权限准入。
- `packages/session/jsonl/src/layout.ts`、`index.ts`：复用原路径解析导出；`packages/session/persistence/src/test/`：恢复/fork 兼容验收，不迁移 Session 格式。
- `packages/shared/src/context-projection.ts` 和既有 Desktop Context/压缩相关测试：最终输入兼容；默认不改 UI 样式。

Desktop 接线限定在上述两个 Host 文件，复用 `apps/desktop/src/main/test/runtime-v2-output-reference-flow.test.ts` 验证，不扩展成前端重构。

## 任务

### P4.1 披露状态与选择算法

- [x] 独立注册 `context-disclosure` behavior，复用 Context state/codec，行为关闭仍保留历史解码。
- [x] 按规范化文件路径登记、合并 owners 与精确历史 seq；所有来源共用一份读取计数。源无明确工作区时不猜相对路径；目录不入活跃列表。
- [x] 实现周期算法：本周期读过或新加入者参与选取，reads 降序、lastReadAt 降序、addedCycle 降序、ID 升序，取前 100，其他睡眠。先固定入选 ID/顺序再清零推进。
- [x] 周期中新增只从当前 active + 新项裁剪到 100，不从已有 sleeping 提取；新路径保护不突破上限。重复登记不改变 addedCycle、不加计数、不唤醒。
- [x] 成功读取睡眠文件只计数，下一次成功压缩排名进入前 100 才恢复。禁用压缩时不清零/唤醒，仍执行新项容量裁剪。

### P4.2 可信工具事实与路径收集

- [x] `read_file` 成功结果 detail 添加命名的文件事实（规范化路径、文件类型、读取成功）；正常正文、图片与 unchanged 命中均携带。同一调用按提交结果 seq/callId 去重，分页成功每次 +1。
- [x] 明确修改文件的工具可报告目标文件用于登记，不计读取；shell 仅登记其已有完整输出 artifact，不能从命令字符串推导文件读取。
- [x] Loop 在 tool/result 提交后 awaited 交给引擎；恢复从持久结果的命名 detail 补记未落 state 的事实，覆盖“结果已提交但计数未保存”断点。失败/拒绝/目录列举/grep 命中不计数。
- [x] 不扫描任意 detail 字段冒充事实，只接受已注册工具来源定义的命名字段；旧记录缺少该字段不回推伪造历史次数。
- [x] 压缩路径从原始待替换内容和明确引用收集；Relevant Files 可补充。归一化与合并后不重复计数；去重不删除摘要正文的文件/目录说明。

### P4.3 压缩完成与状态恢复

- [x] 依共享契约落候选、core 事务、applied 三阶段；将 compactionId 作为幂等身份。索引生成失败后修复派生状态，不再次调用 summarizer。
- [x] 故障注入点：候选分批中途、候选 flush 后、core 事务中途、有效 end 后、applied 前、索引 artifact 已创建但引用未提交、下一请求 checkpoint 前。
- [x] 断点重启后断言 Surface/精确来源合法；无有效 end 不应用候选，存在有效 end 恰好整理一次。禁止把 acceptedSeq 当 durableSeq，也不假设 appendMany 是跨所有后续步骤的原子事务。
- [x] 状态 reducer 增量折叠，新请求只处理上次水位之后事件；冷启动一次重放，不能每个 step 完整重扫整个 Journal。

### P4.4 睡眠索引、原始历史与读取缓存

- [x] 以现有 Session artifact 生成可重建睡眠索引；只在展示集合变化时创建新版，持久记录类型化 artifact 身份，Context 输出解析后的路径。索引内容列具体文件/说明/历史 seq，不带计数。
- [x] JSONL Host 使用现有 layout 返回对应 Session 的原始 journalPath；Context 不依赖 dataRoot 或 jsonl 实现。内存后端不伪造文件，不启用无法访问的历史文件导航。
- [x] 原始历史走现有工具权限准入与执行前复验；登记导航不自动授予访问权。允许的资源限定为对应 Session 文件 read，测试其他 Session 文件与 write/delete 不被连带放开。普通文件权限行为不变。
- [x] 当前实际原始文件可用时写 path + sourceEventSeqs；序号按精确集合保存，显示可合并连续范围，不能当作文件行号。测试含工具输出和长 JSONL 行的真实文件，不生成摘录文件。
- [x] read_file 缓存键加入有效 Surface.replaceGeneration；源文件未改变但压缩后第一次重读返回正文。未变化缓存命中仍记一次读取，失败不计；父子 Session 缓存隔离。
- [x] 睡眠索引自身不作为活跃资料登记、不计入热度排名，防止索引套索引。

### P4.5 fork、卸载与最终输入

- [x] 使用类型化 artifact 引用让现有 fork 正确复制索引。子会话第一次组装关闭继承的导航版本，重建子索引和可访问历史路径；不全局替换历史字符串、不重写父记录。
- [x] 子会话继承边界上的读取计数，后续独立；父子目录文件不可变且不互相覆盖。跨会话历史的来源和权限不因 fork 消失。
- [x] 禁用披露后不产生导航、新路径状态；正文和压缩照常。重新启用恢复旧状态但不补算停用期间访问；required Codec 始终可用。
- [x] 最终 LlmInput 与请求快照一致，活跃导航进入消息尾部、system 稳定；当前活跃 100 条不等于扫描删除所有旧消息路径。真正内容无变化时前缀保持，不声称仅换 user 角色就保证 provider cache hit。
- [x] 保持 Context Popup、右侧 Context 详情、压缩进度/摘要、停止与重试的现有产品行为，不新增设置页面。

### P4.6 边界、规模与交付

- [x] 以 0/1/100/101 条、相同计数、全未读、本周期新项、旧睡眠读过、失败压缩作为固定 fixture。额外 10000 条睡眠引用证明事件分批低于限制、模型请求只含不超过 100 活跃文件及一个索引入口。
- [x] 验证 1 MiB 单事件限制和分批恢复；长单路径/说明超限返回明确错误，不截断成错误路径。冷热两种状态组装不重复生成同一索引，不因读取计数变化追加导航。
- [x] 运行本阶段定向测试及最终检查；关闭本任务创建的临时进程，保留必要验收证据，不删除用户原始数据。
- [x] 更新设计状态、包 README、当前架构/请求快照说明与 history，完成 execution-summary；代码完成后移动整套计划至 completed，保留实机/Provider 未覆盖项。

## 自动化验收命令

新增 Context `src/test/{disclosure,compaction-recovery,history-paths}.test.ts`；扩展工具 node-ports、Session fork/golden、Loop output-references/auto-compaction 与 Runtime integration。fixture 必须使用临时目录，不能读取真实用户历史。

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/context test
pnpm --filter @actspace/compaction test
pnpm --filter @actspace/tools-filesystem-read test
pnpm --filter @actspace/tools-filesystem-write test
pnpm --filter @actspace/tools-shell-tools test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/agent-host test
pnpm --filter @actspace/desktop exec vitest run src/renderer/test/context-popup.test.tsx src/renderer/test/context-render-view.test.tsx src/main/test/runtime-v2-fixed-renderer-projection.test.ts
```

完成定向修复后执行一次仓库最终检查；新增失败才定向重跑，不无理由反复跑全仓。

```sh
pnpm check:docs
pnpm check:repo
pnpm check:packages
pnpm check:package-cutover -- --strict
pnpm check:v2-legacy-removal -- --strict
pnpm typecheck
pnpm test
pnpm build
```

记录已有基线失败与新增回归，不能通过跳过测试或修改无关断言换绿。CLI 真实进程能力由现有 `pnpm test:agent-cli:process` 验证，原始历史另由 Host 临时目录集成 fixture 验证；这两者都不等于 Electron 验收。

## 真实模型与 Computer Use 验收

先读 `docs/FRONTEND_VERIFICATION.md`，使用隔离 userData 和测试会话，主 Agent 定位/修复；按仓库规则默认委派 `gpt-6.1-sol` 做 Computer Use 验收，不可用时明确记录限制，不能静默换模型。

验收点：

- U1：Agent/Plan 请求、工具读取和当前 Context 内容可查看，原有工具消息、附件、图片/引用无退化。
- U2：Chat 保留其规则与工具边界，模式切换后不残留不适用的工作区/Skill 新贡献。
- U3：手动压缩出现现有进行中/完成状态，摘要完整包含 Relevant Files；失败和无需压缩反馈清楚。
- U4：构造冷路径与热路径，压缩后展示正确导航；读取睡眠文件不立即出现为活跃，下次成功压缩根据排名恢复。
- U5：原始历史路径与睡眠索引实际可读；压缩后重读源文件返回正文；拒绝权限时正常报错，不伪造成功。
- U6：重启/恢复/fork 后任务可继续，父子引用和计数独立，既有历史和摘要仍可查看。
- U7：Context Popup/详情展示实际输入，容量来自本次模型；新补充不冒充用户气泡，不新增设置页。
- U8：英语学习、停止、重试在新的来源/请求链路下仍可用；同一请求重试不重复尾部补充。

按操作路线分组，不缩减验收点：

1. 一次进入隔离测试会话，执行正常消息/附件、文件读取、Context 查看、模式切换及英语学习/停止重试，覆盖 U1/U2/U7/U8。保存关键请求/界面证据，不逐操作截图。
2. 在同一测试会话完成热冷路径 fixture、压缩、睡眠读取、第二次压缩及权限失败，覆盖 U3/U4/U5/U7；以 Journal/模型输入辅助核对计数，不能仅靠最终截图判断周期行为。
3. 对该会话执行重启、恢复、fork 和子会话读取，覆盖 U6，并定向复查 U4/U5。失败回主 Agent 修复，再复验受影响点。

逐点记录通过/失败/未覆盖。自动压缩触发另用真实 provider/降低测试配置到可达阈值验证一次，恢复测试配置；fake provider 可证明算法不能证明真实摘要质量。真实 provider 的 cache 命中如未观测，只声明消息前缀一致，不声称缓存通过。

## 回退

索引是派生产物，丢失时从持久状态重建；原始 Journal 不能删除。披露故障可撤销其行为，保留普通消息和压缩能力；Codec 必须保留。压缩已成功但派生提交未完成时先恢复协调器，不能通过再次清零或第二次摘要修复。全量回退到旧二进制的 required Codec 限制按总计划说明，不执行数据迁移式回退。

## 实施证据与限制

本阶段代码已完成。实际命令结果、首次测试异步异常及复跑结果见[执行摘要](../../../exec-runs/20261006-context-management-engine/execution-summary.md)。勾选表示工程任务完成，不表示所有产品场景已用真实 Provider 验收；U1–U8 的状态以 Computer Use 报告为准。故障注入使用真实 Journal 编码/投影及模拟失败和持久前缀，未声称执行了每个切点的操作系统掉电实验。
