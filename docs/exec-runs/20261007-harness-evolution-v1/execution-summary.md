# Harness 自进化 V1 执行摘要

分支：`codex/harness-evolution-v1`；[已完成计划](../../exec-plans/completed/20261007-harness-evolution-v1.md)。核心代码、自动化与构建已完成；真实桌面逐项记录见[Computer Use 验收](computer-use-acceptance.md)。未提交或推送 Git。原有设计文档变更已保留。

## 交付内容

- 官方资源包 `@actspace/official-skills`，默认开发 Skill、模板与契约；原 Skill 发现/UI 扩展官方来源、稳定 id、禁用与遮蔽，兼容旧显示名称禁用项。
- `plugin_manager` 与 `harness_inspect`，支持工作区创建/源码复制、固定构建、候选准备、授权应用、状态、丢弃和回退。
- Host 持有的 HMR：意图→Control 选择→会话绑定，按会话串行；丢失响应和中断后恢复，不自动创建任务。
- 当前 Run 保持旧租约，下一消息取新选择；父 Run 子任务与活跃能力查询固定原 generation。其他会话与 main 不受演化提交影响。
- 未定制旧 bootstrap 的内置升级保留历史；自定义选择不会被替换。Actor 只预留固定版本引用，V2 不实现。

本版可编辑范围：无外部 import 的单文件 TypeScript JSON 工具，适用于文本与数据处理。内置核心插件、任意依赖安装、自动失败触发、独立沙箱、Actor 身份不在本版。

## 自动化证据

| 覆盖 | 命令/测试入口 | 结果 |
|---|---|---|
| 固定构建、复制修改、版本不覆盖、回退原基座、失效候选与坏源码 | plugin-manager lifecycle | 5 通过 |
| 首次分支、来源竞争、授权、持久选择、恢复、内置升级不覆盖用户选择 | harness-control 全包 | 26 通过 |
| 闸门、提交后丢失响应、绑定恢复、冲突、取消、损坏拒绝与生命周期 | harness-hmr 全包 | 3 通过 |
| 真实 Runtime/正常工具链、旧 Run、新消息、隔离、重建恢复、审批收据 | runtime 全包 | 53 通过 |
| generation 生命周期、工具权限、调度、模式、Loop、子任务、Skill | boot / tools-runtime / agent-service / core-agent / core-agent-loop / subagent / prompt / official-skills | 分别 22 / 30 / 32 / 17 / 37 / 11 / 9 / 1 通过 |
| Desktop renderer + 两个相关 main 测试文件 | Desktop 定向 Vitest 集合 | 670 通过、1 项既有 skipped；首次 626 通过，资源 URL 转换问题修复后 44 项复验通过；旧名称禁用兼容另定向通过 |
| 类型与构建 | Runtime 依赖闭包 build；Desktop typecheck、renderer/main/preload build | 通过；保留既有大 chunk 提示 |
| 无 checkout 的生产制品 | package-agent-cli，制品目录读取官方正文/引用/模板、调用随包 TypeScript 构建并实际执行产物 | 通过；不是安装后真实模型体验验收 |
| 独立 CLI 进程 | test-agent-cli-package --artifact-dir；制品解包、help/version、受控模型运行、持久化与恢复 | 通过；执行目录不在 checkout 内 |
| 仓库边界 | check:packages / check:desktop-build-graph / check:package-cutover / check:current-docs / check:docs；git diff --check | 通过 |

后端共 246 项通过，按包去重，不把中间复验重复计数。Runtime 的核心场景使用受控 LLM adapter，经过正式 ToolRuntime/审批/Control/Cordis 链路，不是远端真实模型自主开发。

## 验收点映射

设计 09 的 V1-01 至 V1-15 对应：

- 01–02：资源制品 smoke + discovery/UI 列表测试；真实 UI 部分见单独记录。
- 03–06：Manager 实际编译/加载/调用、固定源码比较、隔离、删除工作区后准入、Runtime 重建恢复。V1-03 的真实模型自主编写与实机下一消息调用仍未覆盖。
- 07–09：语法/schema/权限/来源冲突失败、候选失效恢复、HMR 准入闸门、Run 固定工具定义与新消息测试。
- 10–13：工具注册释放、版本并存、父 Scope 固定、重复应用冲突、持久意图恢复、取消与回退。HMR 用受控故障注入复现提交后丢失响应，不宣称测试了所有 OS 断电组合。
- 14：源码副本、固定 artifactIds/executionDigest 与持久组合描述可引用；Actor 消费者尚未实现，跨 Host 搬迁并非本版已验证功能。
- 15：无失败自动触发路径；Runtime 测试断言应用后未额外生成 Run。产品状态由工具回执与实际 Run 记录区分，无新增专门管理页面。

真实 Electron 已确认官方 Skill 来源、默认启用、无卸载入口、禁用保存与 Composer 隐藏同步；开关已恢复启用。启用后的 Composer 选择、主动重启持久化及真实模型交互未覆盖，正文预览入口未提供。

## 用户试用步骤

1. 使用本分支启动应用，在扩展 → Skills 确认 `actspace-plugin-development` 启用。
2. 进入 Agent 模式，提出：“给当前会话新增一个文本去重工具，输入字符串数组，返回去重结果。”
3. 检查 Agent 创建源码、构建、请求初始化和正式启用许可；授权对象应显示固定版本摘要。看到 bound 后，本条消息仍使用旧 Harness。
4. 发送下一条消息请求调用刚创建的工具；另开会话确认没有该局部工具。
5. 再明确提出修改这个工具，确认使用源码副本且旧版本保留。重启后继续原会话，确认局部选择恢复。
6. 要回退时指定 inspect/status 给出的历史 digest；首个工作区 source.executionDigest 可恢复原基座。

## 未覆盖与限制

真实远端模型自主阅读 Skill、生成源码、接受两次审批、下一消息调用及真实交互停止没有在本次使用用户凭据执行。Computer Use 只报告它实际观察到的项目。未做 Windows/Linux 安装测试、签名/公证、全部 OS 崩溃点测试。

同进程插件是可信执行，初始化许可与正式启用授权分开；它不是恶意代码沙箱。V2 的评估隔离和自动晋升另行实现。已有定制 Harness 不自动迁移管理入口；使用 Host 的可信维护路径处理，未新增批量迁移 UI。

## 追加验收

后续按用户要求新增失败路径回归，本轮 169 项测试通过；Computer Use 补齐 Composer 启用选择和完整重启持久化。详见[追加测试记录](testing-retest.md)，本节更新上文首次验收中对应的未覆盖状态，真实模型闭环仍未覆盖。

## 真实模型验收补齐

后续由 gpt-6.1-sol 操作真实 Electron，应用 deepseek-flash 自主开发并启用去重工具，下一条消息实际调用返回 `["a","b","c"]`，另一会话仍使用 main 且无新工具。此前“真实模型闭环未覆盖”的结论由本次结果更新。过程发现并修复目录/通用插件工具审批按钮缺失；详见[真实模型验收](real-model-acceptance.md)。本次是一个简单工具样例，不代表任意插件开发成功率或 V2 沙箱评估。
