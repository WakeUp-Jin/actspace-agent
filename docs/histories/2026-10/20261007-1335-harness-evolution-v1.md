## 2026-10-07 | Task: 实现 Harness 自进化 V1

### Execution Context

- Agent：Codex 主线程。
- Runtime：Codex Desktop；真实界面验收按仓库规定委派 `gpt-6.1-sol`。
- 分支：`codex/harness-evolution-v1`；未提交或推送。

### 用户诉求

> 确认先做 V1：用户主动要求修改工具，当前 Run 保持旧 Harness，下一条消息使用新版本；默认提供官方开发 Skill，V2 再做失败触发与评估，Actor 留扩展。创建分支后实施。

### 改动

- 新增 official-skills 资源包和插件开发 Skill、模板、契约；统一运行时和桌面列表的 Skill 身份、优先级与禁用设置。
- 新增 Plugin Manager 与 HMR 模块，完成源码副本、固定构建、候选准备、初始化/启用授权、会话绑定、恢复与回退。
- 扩展 Control 首次分支与原基座回退；仅未定制的 bootstrap 可升级到带 Manager 的内置版本，保留原始历史。
- Runtime 每个新 Run 获取会话选择；旧 Run、其子任务及活跃能力查询固定旧 generation；注册与清理由 Cordis 管理。
- 实际首版源码契约为无外部 import 的单文件 TypeScript JSON 工具；没有任意依赖安装或内置核心源码修改。V2 沙箱与 Actor 实现不包含在内。

### 设计动机

将产物生成、正式选择、会话绑定和 Run 使用分开，避免半完成选择被新消息读取，或模型看旧 schema 却执行新实现。固定产物保存可重建源码，后续 Actor 消费能力版本不依赖临时工作区。

### 主要文件

- `packages/official-skills/`
- `packages/plugin-manager/src/`
- `packages/harness-hmr/src/`
- `packages/harness-control/src/service.ts`
- `packages/boot/src/harness-generations.ts`
- `packages/runtime/src/harness/`
- `packages/prompt/src/skills/discovery.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-skills.ts`
- `apps/desktop/src/renderer/components/extensions/SkillsSection.tsx`

### 验证与边界

后端相关包 246 项通过，Desktop 定向集合 670 通过、1 项既有跳过；构建、类型检查、仓库边界与文档检查通过。CLI 制品在无 checkout 环境读取官方资源、构建并执行生成代码成功；独立 CLI 制品进程的受控运行、持久化与恢复 smoke 通过。两次测试暴露的 schema 叶子兼容与 Vite URL 资产转换问题已修复并复验。

真实 Electron Skill 路线与未覆盖项见[执行摘要](../../exec-runs/20261007-harness-evolution-v1/execution-summary.md)及其逐项记录。受控 LLM adapter 测试不能代替远端真实模型自主开发；没有使用用户凭据执行该验收。现有编译器大 chunk 与 CSS highlight 提示不影响构建。

命中新概念、可迁移和陷阱，沉淀[Run 固定 Harness 版本](../../learnings/2026-10/20261007-run-pinned-harness.md)。

### 追加回归

按用户要求新增 Manager 生命周期用例：拒绝正式启用保持原选择、可继续获取旧租约、丢弃后候选释放且不能应用或重建。重新运行 Manager（6）、HMR（3）、Control（26）、Runtime（53）、官方资源（1）、Prompt（9）共 98 项及 Desktop main Skill（1）均通过；Manager typecheck 通过。此计数为本轮实际重跑集合，未重复运行的上轮测试不计入本轮。

追加 Composer 三文件 70 项通过，本轮重跑总计 169 项。

真实 Electron 复验补齐启用后 Composer 选择与完整进程重启后的禁用设置持久化，开关已恢复启用；未连接模型，真实模型工具闭环未覆盖。见[追加测试记录](../../exec-runs/20261007-harness-evolution-v1/testing-retest.md)。

### 真实模型验收与审批修复

使用 gpt-6.1-sol 操作真实 Electron，应用内 deepseek-flash 自主读取 Skill、创建工作区、编写源码、构建、prepare/apply，并在下一条用户消息调用新工具；输入 a,b,a,c,b 返回 a,b,c。发现目录列表和通用工具的待审批状态没有可操作 UI，修复 App 投影与 ToolLogLine 通用审批，复用既有审批组件；无有效 requestId 的历史消息保持普通展示。新增两条恢复审批回归，修复前失败、修复后通过。Renderer 广域测试 669 通过、1 既有跳过、1 历史兼容失败；修复后相关两个文件 15 项复验通过，最终类型检查通过。真实模型测试使用隔离工作区与数据，未变更生产配置。

独立会话 inspect 确认仍为 main 且不包含局部去重工具；最终 renderer 构建通过（既有 chunk 提示）。
