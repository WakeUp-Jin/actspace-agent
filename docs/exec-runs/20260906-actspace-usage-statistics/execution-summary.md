# 使用统计更新执行摘要

状态：2026-09-07，P01–P04 实现完成；自动化与浏览器验证完成，真实 Electron / Provider / 发布制品仍有验收边界。未提交、推送或发布。

## 交付结果

- 设置标题与导航改为“使用统计”，复用 PageShell，使用单层四指标、下划线分类、详情开关和紧凑表格；保留 ActSpace 主题。
- SDK 的默认零价格不再作为真实费用；直连与代理引擎共用纯费用计算，按实际连接及最终模型冻结价格依据。失败 / 截断请求保留已经收到的 usage。
- 目录来自 models.dev / OpenRouter，生成并随包提供 554 条模型数据；通过独立 shared 子入口加载，普通 renderer 不捆绑目录。Desktop 公开目录后台刷新，CLI 离线使用随包目录。
- 启动、发送、统计读取不拉价目；模型设置打开时按 4 小时 TTL 检查，“更新价目”可强制刷新。每源单飞、条件请求、失败冷却、16 MiB 上限、worker 和原子缓存写入。
- 旧无依据零值显示未知，旧非零保留并标记历史来源未验证；USD/CNY 分别汇总。查询先过滤、聚合，再分页；工具不增加未知模型费用数量。没有改写用户 Journal。
- 会话摘要与活动统计去除同一请求 terminal 副本的重复收费。读取缓存由 durable 通知失效，无变更时翻页不再重复读取会话文件。

## 已执行验证

| 验证 | 结果 |
| --- | --- |
| `pnpm models:generate` | 两个真实公共数据源下载、归一化并生成 554 条记录；无用户凭据 |
| `pnpm --filter @actspace/runtime... build` | 通过 |
| `pnpm typecheck` | 全仓通过；最后增加的读取缓存另经 Electron TypeScript 构建验证 |
| `pnpm build` | CLI、renderer、Electron main/preload、worker 构建通过；保留已有大 chunk 提示 |
| `pnpm check:docs`（包含 current-docs）、`pnpm check:frontend-theme`、`git diff --check` | 通过 |
| shared model-catalog 定向测试 | 3 通过 |
| llm-service 测试 | 15 通过，含 3 个费用计算用例 |
| llm-pi-ai 测试 | 14 通过，包含真实 SDK 默认零价格探针与代理截断时有缓存用量的估算 |
| Desktop 最终模型 / credential endpoint 选择 | 5 通过，包含费用匹配最终端点与 reasoning 模型 |
| core-agent-loop 定向测试 | 10 通过 |
| durable-session 新增回归 | 1 通过，验证重复 terminal 与历史零 / 已验证零值 |
| Desktop 目录 / OpenRouter / 投影 / 数据读取缓存 / Usage / Workbench | 合计 39 通过（末次投影单独重跑 12 通过，其余 27 通过） |
| 设置页面兼容测试 | 前序通过；中文导航变更后的 Workbench 15 通过 |
| `node apps/desktop/scripts/verify-usage-runtime.mjs` | 真 SessionStore 写入并回读 15 条请求，14 条估算保留来源；实际构建 worker 解析 10,000 模型，两源各一次请求，TTL 后不重复下载 |

投影 fixture：10,000 请求首次 **23.63ms**，重复分页 **3.59ms**，采样 heapUsed **60.93 MiB**。这是测试进程单点内存采样，不是峰值内存或全库磁盘冷启动耗时。构建 worker 压测事件循环 p95 **16.69ms**；运行环境为 Node，不能宣称 Electron 主进程实测。

浏览器 Computer Use 已观察 1280px 浅色、600px 深色及详情开关、800px 浅色、1440px 跟随系统（当时浅色），最终 1280px 首屏再次核对。截图在本轮工具记录中，未另外导出图片文件。使用显式 fixture，未注入生产入口。真实普通设置页同窗口并排对照及完整键盘遍历没有完成。

## 实现取舍

- 目录归一化测试位于 shared 的 Vitest，而非另建 scripts/test；生成脚本复用同一纯归一化模块。
- 新字段集中于 model-catalog 契约及 usage provenance，未把整份目录复制到每个 ModelDefinition；当前 adapter 输出 estimated / unknown，未接入真实账单同步。
- 保留现有私有 OpenRouter 模型发现，价格覆盖来自统一公共目录；不迁入单位不明的旧价格缓存。公共请求使用 Electron 默认网络会话 / 系统代理，不携带私有连接认证。
- 组件内保留私有摘要、聚合表组件，未为少量重复结构新建 usage 组件目录。
- 读取缓存依赖宿主单写者通知，直接在进程外修改 Journal 需重启重建。首次会话枚举仍走已有读取路径，未新增数据库。

## 尚未完成的验收与复现

1. **真实 Electron 交互**：最初开发启动器在 bootstrap 前退出的问题已在后续修复中定位为临时开发应用缓存不完整。当前标准 `pnpm dev:log` 已启动并记录 `runtime v2 ready`；清理历史后再次启动成功，会话 Journal 数为 0。Computer Use 仍无法按 bundle ID 选中开发应用，因此完整真实 IPC 页面交互、Electron worker 性能、系统主题切换和发布制品验收仍未完成。
2. **真实 Provider**：本次未发送实际付费请求。计算器与 SDK fixture 证明计算和来源规则，不证明供应商账单扣款。后续选择已有连接和可匹配模型，发一条隔离请求，在使用统计详情检查最终模型、估算来源、币种；重启后金额应一致。更新价目后旧金额不能变化。
3. **性能与异常矩阵**：验证了 200/304、5xx、缓存损坏、过期、并发、超限、空数据及 dispose 后无刷新；全部超时 / 更新中退出 / 404 / 429 / 发布打包态尚未逐项实测。目录有相应超时、取消与回退代码，不能以代码存在代替验收。
4. **视觉**：使用 `pnpm --filter @actspace/desktop dev:renderer --host 127.0.0.1 --port 5193`，打开 `/src/renderer/test/fixtures/usage-preview.html?theme=light` 或 `theme=dark` 可重现静态布局；功能测试使用真实页面组件的 Vitest fixture。

[完整计划](../../exec-plans/completed/20260906-actspace-usage-statistics/README.md) · [执行过程](execution-process.md)

## 2026-09-07 截图迭代补充

已按用户批准完成 Maka 紧凑日志布局：八列、模型与工具同表、分类计数、整表详情开关和提示式费用依据，保留四项指标与主题。`tool-calls` 状态修复；step/end 用量回退有单次计数回归。18 个定向测试、Desktop 类型检查及双端构建通过。1440px 浅色与 600px 深色布局、分页、详情开关和空状态已在浏览器 fixture 观察。

用户授权删除开发历史后，停止应用并清理当前会话目录中的 27 份 Journal 及关联附件，保留设置、连接和模型目录；此前 147 次旧请求不再作为当前库数据。删除不是费用修复的必要条件，也没有新增启动自动删除逻辑。

启动复查：`pnpm dev:log` 的依赖闭包构建与 watch 编译通过，开发服务监听 5173；主进程日志记录本轮 `runtime v2 ready`，新建空会话目录内 Journal 为 0。主题颜色契约、文档门禁和修改文件 whitespace 检查通过。Chromium 仍输出已有磁盘缓存告警，但本轮运行时已完成初始化；未扩大清理范围。

## 2026-09-07 悬浮卡片与固定高峰费用

用户批准移除价目页签，增加模型 / Token 悬浮明细，随后根据实际截图明确要求紧凑化：无标题、单位说明、来源、时间、推理解释或计算式；费用列仅显示金额，不再提供弹窗。最终模型与 Token 卡片宽 208px，只显示名称和数值；Token 保留合计，缓存写入为 0 时隐藏，模型缺少缓存写入价时隐藏该项。旧 activeTab=pricing 回到请求日志。

DeepSeek 官方 V4 模型使用固定高峰 USD 单价，来源和 fixed-peak 策略随请求保存，不按时间或目录更新切换。OpenRouter 官方端点的 Chat Completions / Responses 使用公共 OpenAI SDK 保留原始 usage.cost，真实非负金额（包括 0）优先；其他端点与 SDK 计算值不冒充实际费用。代理仍使用原有 scoped fetch。历史记录不重算，本轮没有清理会话。新增 Radix Hover Card 和明确的 OpenAI SDK 包依赖。

验证：Shared 定价 4 项、费用计算 5 项、代理与 Pi 适配 16 项、真实 OpenAI SDK 配合 stub 流 2 项均通过；最终页面与悬浮组件 7 项通过，活动投影 14 项在前阶段通过。Desktop 类型检查、LLM Pi 类型检查 / 构建、renderer / Electron 构建、主题 / 文档门禁通过。浅色模型卡和深色 Token 卡已用 Computer Use 观察；键盘、Escape、hover、缺价与非零缓存写入由测试覆盖。未发送真实付费请求。

学习沉淀补充到既有费用来源文档：SDK 归一化可能丢失实际金额，展示简化不能削弱持久化依据。

最终启动复查：标准开发命令完成依赖闭包构建，main 日志确认 runtime v2 ready。最终精简浮层通过浏览器浅 / 深主题观察；Computer Use 仍无法按 bundle ID 选择开发应用，因此完整 Electron 交互验收不作通过声明。
