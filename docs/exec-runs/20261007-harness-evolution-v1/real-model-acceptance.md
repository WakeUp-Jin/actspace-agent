# 真实模型自进化验收

验收日期：2026-10-07。真实 Electron：`Actspace Dev 990b-cfb4`，bundle ID `com.actspace.desktop.dev.wcfb43fb6`，renderer `127.0.0.1:5195`。隔离项目 `/private/tmp/actspace-evolution-live/project`。应用模型 UI 显示 `deepseek-flash`；验收代理使用 `gpt-6.1-sol`。本次真实模型开发、审批、下一消息工具调用与新会话隔离均完成。

## 验收点与分组

| 验收点 | 预期 | 结果与真实证据 |
| --- | --- | --- |
| 1 真实模型 | 配置连接可响应 | 通过，UI 有真实回复及消耗，主线程另核对 journal 模型完成事件 |
| 2 模型开发 | 读取官方 Skill、inspect、自己文件工具写代码 | 通过，UI 有 Skill/contract/template 读取、create、implementation.ts 与 tool.json 的 Edit 卡；源码由应用模型写入，验收代理未代写 |
| 3 构建和审批 | build、prepare、apply 按具体请求批准 | 通过，UI built 回执、独立初始化与启用审批一次性允许，最终 bound；主线程核对 journal |
| 4 原 Run 固定 | apply 后本 Run 保持原 Harness | 通过，UI 报告 currentRunUnchanged=true，开发 Run main/cc73a54e 与 selected session/09ce0abe 不同，未执行新增工具；主线程另核对 journal |
| 5 下一消息调用 | 实际 ordered_unique_strings 返回指定结果 | 通过，下一条消息 UI inspect 已使用 session/09ce0abe，执行审批一次性允许后工具卡实际返回 `["a","b","c"]`；journal confirmed completed、无 failure |
| 6 会话隔离 | 同项目新会话无局部工具 | 通过，新会话 UI 显示 main revision 1、cc73a54e，是否包含 ordered_unique_strings=否；主线程核对其 inspect 原始结果 tools 不含该工具 |

操作分三组：开发审批（同一 project 会话，观察各阶段与审批）；下一条消息调用（复用会话，观察新 Run 和真实输出）；新会话隔离（同项目另建会话，仅 inspect）。没有增加其他验收场景。

## 标识与复现路线

开发/调用会话：`0b1524c5-918b-4bb3-87f4-e4eab9f66c9d`，标题“隔离项目自进化插件验收流程”。

隔离会话：`312ed948-221a-4448-bfbb-97320a38bc65`，标题“检查会话是否注册 ordered_unique_strings 工具”。

工作区：`92f6635c-5cdf-4efa-949c-f12681e7bd26`。源码位于 project `.actspace/evolution/92f6635c-5cdf-4efa-949c-f12681e7bd26/`。

产物：`sha256-04908e3aa464ae3059d045fd99cb11e62d589f00afc852d0f1df6965a2f23403`。局部 executionDigest：`09ce0abe2cd0008a5c267947391561fc4b7a62d035766fb7dcc70b08f05a6005`。基线 digest：`cc73a54eee4c55bf0091a0bde781a670e3339d24887c342a4e4fe034268e0c7e`。

1. project 新会话要求模型读取 actspace-plugin-development Skill、inspect、create ordered_unique_strings、使用文件工具编辑、build、prepare、apply。明确仅新增去重工具的实际调用留下一条消息，现有管理和文件工具立即执行。
2. 一次性批准官方资料只读访问。工作区文件 Edit 按现有自动权限完成，没有扩大权限。复合 Bash ls 被策略拒绝，模型自行改用目录工具。
3. 在 prepare 的固定产物审批和 apply 的具体局部 Harness 审批分别点“允许”，观察 ready → bound 与原 Run 固定。
4. Run 结束后发送 `{"values":["a","b","a","c","b"]}` 实际调用请求。模型先 inspect 后 invoke，一次性批准用户创建工具执行；工具卡及最终回复返回 `["a","b","c"]`。
5. 同 project 新会话只调用 harness_inspect，实际返回 main 与无新增工具。

第一次开发提示中的“本条消息不要执行新工具”被模型误解为禁止所有工具，随后澄清，属于提示修正，不计为产品成功。

## 实际发现并修复的 Bug

目录工具审批期间，会话显示“等待审批”，真实窗口截图与 AX 末尾均没有允许/拒绝按钮。主线程定位为目录 preview 丢失 approvalPending；通用工具亦缺少审批组件，影响 plugin_manager prepare/apply。

主线程完成修复及回归测试后热更新。真实 UI 定向复验：模板目录请求出现允许/拒绝，一次性允许后恢复运行并返回 Listed；随后 prepare、apply 和新增工具执行的通用审批入口均可见、可操作，并成功推进。原阻塞已解除。测试证据由主线程维护；本报告不把测试结果当成 GUI 验证。

## 证据边界

GUI/Computer Use：真实 Electron 中输入测试消息、读取 AX 状态、关键阻塞截图、逐项审批、工具结果卡与最终回复、会话运行/空闲状态及新会话隔离结果。

运行时/journal：主线程独立核对两会话持久 journal，确认模型工具调用、固定候选、bound/currentRunUnchanged、下一消息版本、ordered_unique_strings completed 输出和新会话 tools 隔离。

未测试 V2 沙箱、回退、重启恢复、其他模型或其他场景；无这些能力的通过声明。验收子智能体未读取/打印凭据，也未改产品源码；主线程修复了上述审批 UI，测试工具源码仅由真实应用模型在隔离项目内生成。主线程为本次已授权真实调用复制了本机设置与凭据文件到权限受限的隔离目录，未输出凭据内容；验收结束后停止测试实例并删除临时 secrets.json。
