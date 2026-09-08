# ActSpace 模型设置页面 Maka 风格重做 — 执行摘要

## 2026-09-06 最新增量结果

已落地用户指定的九家供应商和三种自定义协议，名称、顺序、Logo 与平面列表统一。三种协议均保存到独立连接，手填模型按连接安装；旧连接无 protocol 时保持 Chat，退下目录的已存连接保留。

修复重启时丢失独立连接凭据、模型更新丢失 connectionId 和 V4 模型更新被旧元数据覆盖的问题；连接变更串行执行，编辑失败回滚 Key。禁用和删除连接不会借用其他账号。

本增量相关验证合计 Desktop 79 项、Shared 22 项通过。Shared 构建、Desktop typecheck、renderer / Electron main-preload 构建、主题检查、文档检查、diff 空白检查通过。Renderer 已检查浅色目录与 Responses 表单、深色 375px 目录；布局没有横向溢出。Computer Use 仍无法识别真实开发应用，Electron 实窗及真实供应商请求未验收。代码涉及主进程，查看最终运行效果需重启开发应用。

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260901-actspace-model-settings-maka-redesign/README.md`
- **执行过程**：`docs/exec-runs/20260901-actspace-model-settings-maka-redesign/execution-process.md`
- **执行模式**：交互
- **执行结果**：M1、P2、连接级模型绑定、自定义兼容连接及多连接 UI/持久化已完成；添加连接增量及浏览器 Renderer 预览已完成；真实 Electron 截图验收仍未完成（本轮 CUA 无法识别开发应用，返回 Invalid app）。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
| --- | --- | --- |
| 模型页 Maka 风格重做规范 | `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md` | 冻结列表、目录、配置、详情和模型目录的页面语法 |
| 模型页独立执行计划 | `docs/exec-plans/completed/20260901-actspace-model-settings-maka-redesign/README.md` | 规定阶段、边界、风险和验收方式 |
| 执行记录 | `docs/exec-runs/20260901-actspace-model-settings-maka-redesign/` | 记录实施过程和最终人工验收指引 |
| 模型连接列表 | `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx` | 扁平连接行、目录筛选、页面内配置和 Maka 风格详情分隔行 |
| 模型目录嵌入 | `apps/desktop/src/renderer/components/settings/ModelSettings.tsx` | 按 Provider 过滤并在连接详情中展示 |
| 页面宽度与标题 | `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`, `SettingsPage.tsx` | 模型页使用 880px 内容宽度，单 h2 + h3/h4 层级 |

## 人工验证指引

代码实现完成后补充：

1. 在 1280px 查看连接列表、添加目录、配置页和连接详情。
2. 在 375px 查看目录搜索、详情行换行和操作按钮。
3. 在 Electron 中确认真实 Provider 数据、凭据状态、余额刷新和配置保存。

## Agent 已完成的验证

- 已完成用户截图与 Maka 源码的只读差异审计。
- 已完成设计规范、执行计划和执行记录文档落盘。

## 已知风险和遗留事项

- 真实 Electron 中的 Provider、凭据和余额数据仍需人工复核。
- 当前页面保留旧的 OpenRouter 模型目录弹窗，因为它属于模型目录的二级操作，不影响首屏布局。
- 前轮历史记录：全量 Desktop 测试 82 个文件、557 个断言全部通过；模型设置与设置页定向测试 45/45 通过，连接迁移测试 6/6 通过。
- `check:docs`、`check:frontend-theme`、`git diff --check`、Shared 构建、Desktop typecheck、Electron preload 构建均通过。
- 添加连接目录已收口为 API Key 首批供应商：DeepSeek、Kimi、OpenRouter、OpenAI、xAI/Grok、Mistral、Qwen、MiniMax、Z.AI、Groq，并保留多条自定义 OpenAI-compatible 中转连接。

## 后续建议

- 在 Electron 中按 1280px/375px 验证四条路径：连接列表、添加目录、配置页、连接详情。
- Desktop renderer production build 已完成；构建仅保留既有 bundle size warning，不影响产物生成。Electron 真实窗口仍需在可识别开发应用的桌面环境完成。

## 2026-09-06 添加连接增量验收

- 使用 Maka 原始品牌 SVG 路径和资源补齐首批 API Key 目录；MiniMax 使用 Simple Icons SVG。资源和许可证记录在 provider-marks/README.md。单色标识随主题翻转，自定义连接按 catalogId 映射品牌。
- Key 表单统一输入框、显示/隐藏、单一行内路由标题与紧凑操作区，移除遗留 Dialog 包装。目录搜索固定桌面宽度，取消返回保留筛选，空结果可清除筛选。
- 修复已有连接更换 Key 未提交、自定义连接编辑未打开、仅有自定义连接时误显示空态。保存失败保留草稿。
- 高级连接设置只展示现有地址、代理和 Management Key 能力；移除没有真实编辑链路的 Header/JSON 操作。
- 新增三条交互回归，覆盖兼容连接取消/筛选/显隐、换 Key 失败重试、自定义连接编辑/保留 Key/品牌映射；相关两个文件共 48/48 测试通过。
- Shared build、Desktop typecheck、Renderer production build、Electron main/preload build 通过；Renderer 仍有大于 500 kB 的 bundle 提示。
- 显式开发夹具：`apps/desktop/src/renderer/test/fixtures/model-settings-preview.html`，复用真实 ProviderSettings 与样式，所有保存均为失败样例，不读取或写入用户凭据。
- 已通过 CUA 查看 1024px 浅/深目录、浅色 Kimi Key 表单、375px 深色 OpenAI 兼容表单；箭头与标题同行、Logo 可见、输入及按钮无横向裁切。截图见本轮工具记录，未把 mock 当成 IPC 验收。
- 原生验收：按 dev-runtime 日志的 appId 和 appPath 定位开发版应用，CUA 返回 Invalid app，未观察到真实 Electron 窗口。真实供应商请求、凭据保存与新连接焦点恢复仍需最终验收。
- 本轮主题检查、diff 空白检查通过。全仓 `check:docs` 被其他任务的 `20260906-agent-tool-experience` 计划阻断：状态已完成但仍位于 active；未改动该任务文件。
