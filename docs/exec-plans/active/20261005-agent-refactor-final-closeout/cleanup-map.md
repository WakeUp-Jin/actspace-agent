# 代码与文档处置映射

本页规定处置方案，不表示已经实施或验收。关联[主计划](README.md)。所有仓库路径相对根目录；表中缩写路径以前一完整父目录为准。

## C：已确认的改动清单

| ID | 准确位置与当前问题 | 最终动作、消费者与验收 |
| --- | --- | --- |
| C1 | `packages/core/agent/src/inbox.ts` 的 status、InboxItemStatus、InboxClaimOptions；Loop 只调用 next-step claim 和 task_notification enqueue | 删除无生产消费者的 status/选项；写侧固定后台通知，不再开放旧 next-turn/steer 写入。更新 `packages/core/agent-loop/src/loop.ts`、`src/test/steer.test.ts` 和 package exports。保留 journal 读侧及旧事件丢弃规则；测试当前 Task 插入、通知、取消和恢复，不能批量删除含 steer 的事件 |
| C2 | `scripts/test/agent-cli-process.test.mjs` 只有 SIGINT 场景，解析会跳过非法 stdout 行 | 增加真实 HTTP retry/error fixture 和严格协议断言；按验证附件 V-CLI 完整结算旧 P05，保留 SIGINT 回归 |
| C3 | `scripts/check-package-cutover.mjs` 把 `.astro` 生成缓存当源码 | 明确排除生成目录，增加 `scripts/test/package-cutover.test.mjs`：生成缓存不误报、真实源码旧入口必失败；加入根 test 命令，不放宽生产旧引用规则 |
| C4 | `scripts/contract-matrix/generate.mjs` 的 check 要求 JSON 已存在 | JSON 改为本地输出；check 验证矩阵有效性和已提交 Markdown。扩展现有 `scripts/test/contract-matrix.test.mjs`，无 artifacts 正例、过期 Markdown 反例、确定性生成；CI 继续使用 --check |
| C5 | `.gitignore` 与被跟踪的 artifacts | `/artifacts/` 整体忽略；取消已有产物跟踪，文件可以本地重建。打包先生成本轮新包再隔离测试；CI upload-artifact 仍可收集忽略文件，不删除发布 workflow 的产物上传 |
| C6 | `packages/session/storage/src/index.js.map`、`src/test/memory-storage.js.map` 是混入源码的生成文件 | 核对 sourcemap 来源及无源码消费者后移除；检查 tsconfig 输出目录，确保重建不再污染 src。不泛化删除手写 JS/声明/fixture |
| C7 | `scripts/create-project.sh` 为旧模板副本，复制范围包含实际配置和产物 | 退役，不移动到 templates 后继续维护或试跑；移除现行调用与说明。本机 code-harness-init 指向独立 npm 包，保持其安装及命令不变；实施前复核不存在新接入的本仓库消费者 |
| C8 | 诊断脚本、terminal-native-spike 的目录职责混杂 | 按 root-layout 迁移；三个 native spike mjs 的 repoRoot 与打包入口全部核对，fixture/帮助和当前引用一起改。旧产品历史不改。移动不是代码删减收益 |

## M：模块职责和完整核对范围

以下覆盖当前 43 个领域 workspace 包和 3 个 app，共 46 项，逐包记录在 scope-inventory。表中“保留”确认模块边界，不代表内部每个导出已经逐行审核。执行中的核对是本轮任务，不是下一轮调查。

| 规则 | 保留位置 | 职责、真实消费方向与允许的清理 |
| --- | --- | --- |
| M1 | `packages/runtime` | 唯一 Host 装配与接线；apps/cli 和 Desktop Host 消费。保留 startup/session/harness/profiles/projection 分区；不承接工具/存储业务。核对 index/loader 导出、重复 getter/空包装、startup 资源释放 |
| M2 | `packages/agent-service` | TaskLedger/SessionRunManager/应用命令；DesktopApp、Headless、Host 消费。保留接纳、排队、Run 分派单一所有者；不合并观察缓存与持久事实，不恢复第二套用户 Inbox |
| M3 | `packages/agent-host`、`client` | 服务端协议/认证/文件访问与客户端连接/订阅分开；Desktop remote-hosts、CLI host 消费。删除旧调用门面须同时核对方法注册和 wire DTO，不改已确认协议行为 |
| M4 | `packages/desktop-app`、`headless` | Desktop 交互策略与 CLI submit-and-wait；复用 AgentApplication，保留各自结果/标题职责，不重复调度和 Run 状态机 |
| M5 | `packages/boot`、`bundle`、`composition`、`harness-control` | 构建/组合/准入与授权启用/恢复分工；Runtime 消费。保留 generation lease；删除旧别名须查 manifest 动态依赖，不为了“一个包”混合控制和执行 |
| M6 | `packages/cordis-adapter`、`core/agent`、`core/agent-loop`、`core/scope` | 插件基底、身份/后台通知、可替换 Loop、作用域。Runtime 和工具按公开契约消费。统一 Cordis 事件与 disposal；执行 C1，不删历史 codec，不新增 EventEmitter |
| M7 | `packages/session/storage`、`jsonl`、`persistence`、`journal`、`checkpoint-policy` | 中性读写契约、物理实现、Session 语义、事实/codec、await checkpoint 分离。Runtime/Host 经 port 消费，JSONL 文件租约不得泄漏到中性接口 |
| M8 | `packages/session/projection`、`projection-cache` | 事实折叠与有界缓存/索引；Runtime/Client 投影链消费。不将缓存当持久事实；删重复转换须保证相同 DTO/水位含义 |
| M9 | `packages/llm/service`、`llm/pi-ai`、`context`、`prompt`、`compaction` | 模型调用/适配、上下文、提示词贡献、压缩策略；Loop 消费。检查无引用配置和重复归一化，保留供应商/模型用途，不在本轮更换 Provider 或算法 |
| M10 | `packages/tools/runtime`、`approval`、`filesystem-read`、`filesystem-search`、`filesystem-write`、`shell-tools`、`web-tools`、`browser-tools`、`image-generation`、`image-inspection`、`todo-tools` | 独立能力插件经 manifest 注入；检查注册/名称/投影重复，保留 scope、审批和 Host capability 边界。不可因动态服务无静态 import 而删除 |
| M11 | `packages/subagent`、`english-learning` | 子任务/独立子 Run 与可选英语扩展；Runtime/Harness 装配。保留独立配置与生命周期，不为简化包数混入 Loop |
| M12 | `packages/shared`、`util`、`diagnostics`、`test-support` | 跨进程契约、无业务工具、诊断与测试支持。核对 re-export/dependencies 的实际消费者，禁止生产反向引用 test-support；shared 不成为业务实现容器 |
| M13 | `apps/desktop`、`apps/cli`、`apps/site` | 界面/本机 Host、命令行、公开站点。核对 main/preload/renderer、CLI runtime-v2 旧入口和路径；保留独立产品功能。App.tsx 仅在发现具体职责重复时抽取有明确所有者的模块，不进行规模驱动重写 |
| M14 | `browser-bridge/`、`scripts/`、根配置 | Go/Extension 外部 Host 能力、维护入口、工具配置；不混入 TS 插件树。覆盖构建/发布/测试消费者及忽略产物；按 C2–C8 和 root-layout 执行 |

每个模块结算记录：实际文件/符号、用途、静态与动态消费者、保留/删除/迁移理由、修改路径、对应行为测试。新增清理发现符合既定边界且证据明确时本轮处理；发现需要改变产品行为或模块边界时明确阻塞，不能编造死代码结论。结算时清单不得存在“未检查”条目；无法证明冗余的对象保留并写清用途或证据限制，不能标为确认无冗余。

## D：当前规范的唯一归属

下列文件名前缀 `agent-` 均位于 `docs/design-docs/agent-plugin-runtime/`；`front-` 位于 `docs/design-docs/frontend/`。合并是章节语义归并，独有协议字段/失败行为必须迁入主规范再删除副本。除明确处置项外，专题文档校准后保留，不按日期批量删除。

| ID | 原文件/内容 | 主规范与处置 |
| --- | --- | --- |
| D1 | `agent-spec-plugin-runtime-abi.md` 的 bootProfile/BootedProfile；startup/总览重复流程 | ABI 保留公开插件契约并修正旧 API；启动步骤只在 `agent-spec-dsh-plugin-assembly-and-agent-startup.md` 详细维护；Runtime 所有权在 `agent-target-runtime-architecture.md`，总览只保留关系和导航 |
| D2 | `agent-decision-profile-first-headless-desktop.md`、`agent-decisions-v2-foundation.md` 的历史理由 | 独有且仍有效的取舍并入 `agent-harness-host-refactor-decisions.md` 的简短历史取舍节；原页按保护区入链保留短入口或删除，无完整重复正文 |
| D3 | `agent-target-session-and-context.md` 的分层理由 | 合入 `agent-spec-session-core-persistence-separation.md` 与 `agent-spec-prompt-context-contributors.md` 各自相关节；原页退役规则同 D2 |
| D4 | `agent-session-event-persistence-refactor.md`、`agent-session-three-read-models.md`、`agent-target-session-persistence-projection-architecture.md`、`agent-spec-runtime-projection.md` | 写入/恢复语义归存储分离规范；读取 DTO/水位/Registry/cache/分页归 `agent-spec-runtime-projection.md`。实现步骤由已有完成记录承接，前三页独有内容迁移后退役；不得丢失失败与资源边界 |
| D5 | `agent-package-ledger.md` 的手工清单 | 保留身份/命名规则，实际包/服务清单只来自 generated matrix；具体文件职责回 `packages/README.md`，不重复维护三套矩阵 |
| D6 | `agent-research-dsh-architecture.md`、`agent-research-capability-disposition.md` | 保留有独立价值的研究，明确研究时点和现行规范入口；不把研究中旧目标写成当前实现，不扩写新的演化方案 |
| D7 | `front-设置中心重构规范.md` 模型/Usage 重复章节 | 总规范只保留壳、导航、保存与安全职责；模型细节归 `front-模型设置页面-Maka重做规范.md`，Usage 交互归 `front-usage-statistics-refresh.md`，费用事实归 model-context 现行规范，重复章节替换为链接 |
| D8 | `front-composer-file-mentions-and-response-annotations.md`、`front-中间消息区规范.md`、`front-composer-slash-command.md` 中旧 RunAgentInput/compact IPC | 三份各自保留引用交互/时间线/命令入口；任务契约唯一引用 `agent-task-run-lifecycle.md`；同步 shared/current Task 类型、操作队列和失败反馈，不在每份里复制 DTO |
| D9 | `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md` 旧 extractor/审批/Subagent 位置 | 保留当前输出预览协议与必需失败表现；工具输出引用归相邻 `agent-tool-output-references.md`，消息布局归 `front-agent-tool-stream-rendering.md`；旧修复过程仅在已有 history/run 回溯 |
| D10 | ARCHITECTURE、packages README、docs README、design index、TODOLIST、两份 cleanup-review | 删除不存在的 infra/host 包说明、旧 pending 状态；当前架构→现行规范，验证→最终摘要，原始目标→决定文档。两份审计保留本轮结算，不复制全部测试表 |
| D11 | 其他 design-docs 与其 assets | 每份核对标题状态、实际路径/API/配置、唯一内容及主规范关系；现行内容校准保留，未来独立设计明确未实施。工作台/产品概念既有 WIP 只登记保护，不改正文 |

## P/R：执行计划、过程记录和保护区

| 规则 | 对象 | 固定处置规则 |
| --- | --- | --- |
| P1 | `active/20261004-agent-storage-and-cleanup/`、`20260928-agent-forms-and-modes.md`、`20260916-session-background-runs.md` | 实施已完成的内容归 completed，保留未验边界；原路径的保护区引用用短入口接住。本次承接的验收以新结果结算 |
| P2 | `20260928-composer-mentions-annotations/`、`frontend-ui-components-foundation.md`、Chrome/官网/自定义推理计划 | 独立未完成目标保留；完成部分与未来部分分清，不因本轮目标完成而取消 PB、素材更新或独立产品任务。不由本轮补做它们 |
| P3 | 六组早期后端短入口和旧 Composer queue 短页 | 保持回溯用途，不纳入 active 工作计数；已有 legacy-plan-resolution 是唯一目标结算，不再复制长计划 |
| P4 | 其他 completed/discarded 计划 | 独有设计/未验门禁/失败原因保留；与最终摘要完全重复的步骤收缩为链接，废弃页明确生命周期。仅在无独有内容且无保护入链时删除正文文件 |
| R1 | `docs/exec-runs/*/execution-summary.md` 及其他最终验收页 | 保留每项独立任务最终结果、环境和未覆盖项；同一任务多个总结选最新事实完整页为唯一入口，旧结论以带日期的差异说明承接 |
| R2 | process、临时讨论、中间统计/截图/日志/JSON | 失败根因、批准决定、未完成目标、不可再取得的证据先转入同任务 summary；纯重复或被最终证据完全覆盖的内容删除。保留有独立行为证据的截图，不按后缀盲删 |
| R3 | histories/learnings 及指向待清理对象的入链 | 原内容与路径不动；扫描 Markdown/HTML 引用、锚点及文本路径。文本历史源码路径保留历史解释，不虚构现行文件。已存在断链作为 baseline，本轮新增断链为失败 |

scope-inventory 记录实际输入清单；执行结算放 `docs/exec-runs/20261005-agent-refactor-final-closeout/cleanup-ledger.tsv`，字段为 path、rule、action、target、unique_content、incoming_refs、evidence、result。目录合并只能共用理由，不能省略逐文件行。最终输入集合与结算集合双向比较；新增文件也必须入账，计划自身文件单列治理文档，不算业务清理收益。

## 防止再次出现“文档通过但正文漂移”

扩展 `scripts/check-current-docs.mjs` 和其现有测试：现行规范不得宣称被退役的启动/任务 API；历史解释/代码差异示例有明确历史标签才豁免。对保护区只读检查与待删除对象有关的链接和锚点，使用前后增量结果，不把已有断链变成必须改写 history 的理由。机械检查只能防已知漂移，正文逐项核对仍须签收。
