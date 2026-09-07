# 使用统计更新执行过程

## 2026-09-07：实施

用户明确批准完整执行计划。读取仓库规则、当前设计和未提交修改，保留设置中心、模型设置、轨迹和英语学习等并行改动；没有 Git 提交或推送。

1. P01：落地 shared 目录与价格快照、显式生成脚本。公共网络在沙箱内失败，按环境权限规则重试后成功获取两源并生成 554 模型。两个引擎接入统一计算器，去掉 SDK cost 的账单含义；缓存输入互斥，推理不重复收费，失败 usage 沿原 Journal 通道透传。
2. P02：活动投影追加原币金额、来源、完整匹配集聚合；历史零值未知，工具不计入未知请求数。修复 Durable Session terminal 双计数。页面停止混用旧 snapshot。基准发现读取层仍可能扫描文件，补充按 durable 通知失效的合并读取缓存，增加实际读取次数回归。
3. P03：Desktop 目录服务本地启动，公共 net.fetch 后台更新，worker 归一化，缓存 TTL / 条件请求 / 单飞 / 冷却 / 体积限制 / 原子替换。既有 OpenRouter 模型发现复用统一价格，模型设置触发按需检查。
4. P04：Usage 改中文，使用设置 PageShell 与主题 token，精简指标和表格，价目显式刷新。浏览器验证浅/深/系统主题及窄窗口，详情开关工作。单独 fixture 不进入生产入口。

## 问题与修正

- 独立 shared 数据子入口避免 renderer 引入目录，但 CLI 旧模块解析需要显式 tsconfig path；已补齐。
- 一次误将全仓 typecheck 与完整 build 并发，两者会清理 shared dist，造成临时声明缺失；完整 build 通过后串行重跑 typecheck 通过。并发构建结果不作为成功依据。
- 新增回归 fixture 首次遗漏 Journal 必需的 turnId / stepId；按真实契约修正后通过。
- Electron 标准开发启动器在 bootstrap 前以 1 退出，无窗口；去除继承环境变量及 LaunchServices 尝试均未取得真实窗口。保留外部验收缺口，不使用浏览器 mock 冒充 Electron。

## 验证记录

命令、测试数量、耗时、内存采样和真实宿主边界集中记录于[执行摘要](execution-summary.md)。使用真实构建 worker 的可重复脚本为 `apps/desktop/scripts/verify-usage-runtime.mjs`；临时 SessionStore 仅包含脱敏样例，未读取凭据或改写现有用户会话。

最终同步设计、计划、history 和费用来源学习笔记。计划归档表示实现交付，未完成的人工门禁继续保留在摘要。

## 2026-09-07 用户截图后的迭代

- 按已批准方案保留四项指标，下半部分参考 Maka 的数量标签、筛选栏、八列表格与整表详情开关，颜色和控件沿用 ActSpace。
- 排查旧记录：147 次模型请求中 144 次为无依据零值、3 次缺少金额，均为修复前历史；匹配截图请求的 `tool-calls` 结束原因错误显示未知。本轮修正状态并补上 step/end 用量回退。
- 用户明确授权清理开发历史。停止应用后删除当前会话目录（27 份 Journal 及相关附件），确认目录已不存在；模型、连接及设置保留。此为单次人工授权清理，不改变产品历史保留策略。
- `pnpm --filter @actspace/desktop test src/main/test/runtime-v2-fixed-renderer-projection.test.ts src/renderer/test/usage-statistics-page.test.tsx`：18 passed。Desktop typecheck、build:renderer、build:electron 均通过。
- Computer Use：1440px 浅色桌面表格宽 814px、页面无横向溢出；600px 深色表格宽 800px、容器宽 523px、文档宽 600px。分页、详细记录隐藏及空状态已观察；预览为显式 fixture。

- 启动复查：标准 `pnpm dev:log` 完成依赖构建，主进程日志记录 `runtime v2 ready`，清空后新建目录内 Journal 为 0；开发服务保持运行。主题、文档与 whitespace 检查通过。真实开发应用无法由 Computer Use 按 bundle ID 选中，保留完整真实窗口交互验收缺口。

## 2026-09-07 悬浮卡片与固定高峰费用

用户批准移除价目页签，增加模型 / Token 悬浮明细，随后根据实际截图明确要求紧凑化：无标题、单位说明、来源、时间、推理解释或计算式；费用列仅显示金额，不再提供弹窗。最终模型与 Token 卡片宽 208px，只显示名称和数值；Token 保留合计，缓存写入为 0 时隐藏，模型缺少缓存写入价时隐藏该项。旧 activeTab=pricing 回到请求日志。

DeepSeek 官方 V4 模型使用固定高峰 USD 单价，来源和 fixed-peak 策略随请求保存，不按时间或目录更新切换。OpenRouter 官方端点的 Chat Completions / Responses 使用公共 OpenAI SDK 保留原始 usage.cost，真实非负金额（包括 0）优先；其他端点与 SDK 计算值不冒充实际费用。代理仍使用原有 scoped fetch。历史记录不重算，本轮没有清理会话。新增 Radix Hover Card 和明确的 OpenAI SDK 包依赖。

验证：Shared 定价 4 项、费用计算 5 项、代理与 Pi 适配 16 项、真实 OpenAI SDK 配合 stub 流 2 项均通过；最终页面与悬浮组件 7 项通过，活动投影 14 项在前阶段通过。Desktop 类型检查、LLM Pi 类型检查 / 构建、renderer / Electron 构建、主题 / 文档门禁通过。浅色模型卡和深色 Token 卡已用 Computer Use 观察；键盘、Escape、hover、缺价与非零缓存写入由测试覆盖。未发送真实付费请求。

学习沉淀补充到既有费用来源文档：SDK 归一化可能丢失实际金额，展示简化不能削弱持久化依据。
