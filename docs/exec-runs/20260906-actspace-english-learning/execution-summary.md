# 英语辅助学习 — 执行摘要

- 日期：2026-09-07。
- 状态：代码已实施；针对性自动化和浏览器预览通过。真实 Electron 与 MiniMax 音频尚未验收，不等同发布完成。
- [设计](../../design-docs/agent-plugin-runtime/agent-english-learning.md) · [归档计划](../../exec-plans/completed/20260906-actspace-english-learning/README.md) · [执行过程](execution-process.md)。

## 已交付行为

「扩展 → 能力」新增英语辅助学习卡片。选择可用的未归档主会话，开启后只在该会话的后续模型请求中注入英文先行、逐段简体中文对照规则；其他主会话、子 Agent 不注入。默认选择最近选择的可用会话，否则选择最近更新会话。重启后关闭，历史不补播。

成功完成的目标回答只提取英文正文，跳过中文、代码块、思考和工具内容。插件使用 MiniMax 同步合成和有界串行队列；切换、关闭、停止、配置变化及 Scope 释放都会取消旧音频，迟到合成结果不能恢复播放。停止播放保留双语模式。

「设置 → 通用 → 语音播放」提供 MiniMax 中国站 Key、音色、语速、试听与停止。默认 `speech-2.8-turbo` / `English_Insightful_Speaker` / 1.0。缺 Key 时仍可使用双语提示词。Key 存在主进程凭据库，不进入设置读回和 Journal。文本确实会发给 MiniMax，设置中有明确说明。

## 验证结果

| 验证 | 结果与边界 |
| --- | --- |
| `pnpm --filter @actspace/english-learning test` | 12 项通过：真实 Cordis Scope 隔离、主/子会话、Effect 释放、提示词幂等、英文提取、队列取消与限额、MiniMax 协议和错误、完成消息筛选 |
| `pnpm --filter @actspace/runtime test` | 5 项通过；其中真实 AgentLoop + fake LLM 检查 A/B 的 Provider messages、request/context、只读英文、关闭、重放去重及 secret canary |
| Desktop 针对性复测 | 新增 5 项及设置/扩展既有回归共 33 项通过：设置迁移/持久化/凭据读回、IPC 来源与子 frame 拒绝/输入/保存失败、播放器取消/错误/文件清理、最新主会话与失败保留状态、语音配置保存 |
| Desktop 全量回归 | 首次并发运行 635/640，5 项超时；限制 2 workers 后 638/640。剩余 code-render-view、trajectory-relations 单独以 1 worker / 20 秒上限重跑，13/13 通过，实际约 3.6 秒完成。没有修改这些测试的超时配置 |
| CLI | 加载裸插件失败已修复；6 文件中 5 文件/12 项先通过，剩余 Runtime 端到端测试增大命令超时后通过（约 6.9 秒），证明 Headless 能启动、运行、持久化并退出 |
| `pnpm typecheck` | 通过，先构建 Runtime 依赖闭包 |
| `pnpm build` | 2026-09-06 完整构建通过，覆盖 CLI、renderer、Electron main/preload。2026-09-07 收尾重跑被同时进行的费用目录改动阻断：fixed-renderer-ipc / preload 引用尚未出现在 shared 契约的 getPricingCatalog / refreshPricingCatalog；未修改其他任务接口。不能称当前整个工作区构建全绿 |
| `pnpm check:frontend-theme` | 通过 |
| `pnpm check:package-cutover -- --strict`、`pnpm check:v2-legacy-removal -- --strict` | 通过，cutover 零发现 |
| `pnpm test` / `pnpm check:packages` | 根流程被已有工具测试的跨包源码导入挡住：`runtime-v2-tool-stream.test.ts`、`app-streaming-user-message.test.tsx`；本任务未改动这些导入。没有宣称根测试全绿 |
| 浏览器显式 fixture | 已看浅色、深色、约 521px 窄面板；开关、最新主会话、无 Key 状态正常。fixture 不保存数据、不调用语音 |
| Electron 实机 | 未通过启动：默认 5173 占用，改为 5187 后开发 runtime 输出身份即退出，未出现窗口；单独启动已构建 main 同样退出，日志无具体错误。没有用浏览器替代 Electron 验收 |
| MiniMax 实际网络与音频 | 未执行：没有使用有效 Key，没有读取原项目 .env，没有付费请求；fake 音频只证明协议及生命周期 |

`pnpm check:docs`、`pnpm check:current-docs` 均通过。上述测试针对执行时的工作区；目录中另有并行任务修改，不代表其他任务均通过验收。

## 接手验收步骤

1. 使用隔离 `ACTSPACE_DATA_DIR` 与空闲 `VITE_DEV_PORT` 启动 `pnpm dev:log`。按启动日志的 `appName` / `appId` 找到 Electron 窗口，先解决窗口启动失败，核对 preload 与 IPC 均就绪。
2. 创建两个主会话 A/B，在扩展能力卡中确认默认最新会话，选择 A 并开启。分别发送中文问题；检查 A 的实际 request/context 含 `english-learning/v1`，B 不含，A 逐段英文/中文。
3. 用户自行在通用设置输入有效 MiniMax 中国站 Key。保存音色/语速后试听；确认真实可听见英文。缺 Key 或清除 Key 后，双语模式仍开启，语音状态为未配置。
4. 让 A 生成包含代码和工具调用的回答；只在成功完成后朗读最终英文正文。检查无中文、工具中间内容、思考或代码朗读。
5. 在生成、合成和播放时分别切换到 B、关闭、停止。旧音频不得续播，停止保留双语；无注入标记的在途回答和历史消息不能补播。
6. 退出并重新启动：能力关闭，最近选择/音色/语速保留；临时音频与 afplay 无活动残留。实际英文发音、音色可用性、额度、自然语言格式遵守率须人工签收。

显式浏览器预览入口：`apps/desktop/src/renderer/test/fixtures/english-learning-preview.html`，可带 `?theme=dark`。它只验证 renderer。

## 回退

关闭英语辅助学习即可撤销后续请求注入并停播。源码回退移除独立插件装配与固定 UI 入口，保留兼容设置数据；不改写或删除会话 Journal。未执行 commit、push 或发布。


## 2026-09-07 语音模型选择补充

已按用户确认加入 8 个语音模型版本，默认仍为 `speech-2.8-turbo`。在「通用 → 语音播放 → 语音模型」选择并保存；试听和会话朗读使用已保存模型。SettingsService 保留有效模型并持久化，旧配置缺失或未知模型回退默认；模型变化沿用现有配置变化取消机制。

本次局部验证：插件 19 项、Desktop 配置与控件 3 项通过；8 个模型分别验证设置落盘/重新读取及 HTTP body.model。Desktop typecheck、renderer build、Electron main/preload build 均通过。CUA 查看显式 fixture 的浅/深主题，并验证选择 speech-2.8-hd 后保存成功。未重新启动真实 Electron 或调用 MiniMax，实际音频门禁仍保留。本次为局部配置与控件修改，没有重跑根全量测试。
