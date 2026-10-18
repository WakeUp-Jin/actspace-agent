# 子智能体 durability 修复：真实 Electron 验收

日期：2026-10-18。结论：**P1–P5 全部通过，限下述两次真实委派与一次重载场景**。

## 验收点与操作分组

- P1：一次 Explore 父工具成功，返回 README 第一行。
- P2：父轨迹子 read_file 已完成，参数、结果、Schema 可见。
- P3：父最终回复包含正确首行。
- P4：Cmd+R 后父 Explore 和子工具的成功状态、结果保持。
- P5：另一新会话只调用一次 agent 预设，父子成功、最终返回同一首行。

操作分两组：先在隔离 workspace 新建 Explore 会话，检查父结果、子工具与最终回复，再重载分别打开父子详情；随后在同一隔离 workspace 新建 Agent 会话，调用一次 agent，检查父子及最终回复。未重试、未扩展主题或其他场景。

使用 `mcp__cua_repl` 原生 Electron Computer Use、真实 deepseek-flash provider，生产 renderer，无 Vite/mock/Playwright。工作区与数据目录见本地 `tmp/codex-acceptance/20261018-subagent-durability/environment.json`。截图与 AX 文本仅留该本地证据目录，不入 Git；截图扩展名为 .png，CU 实际返回 JPEG 编码。

## 逐点结果

|点|结论|真实 UI 结果与证据|
|---|---|---|
|P1|通过|父 Explore 状态“已完成”，开始 21:52:17.046，2.15 秒，结果返回 `# Subagent durability acceptance`，没有 Tool execution failed。一次 explore，无重试。`fixed-explore-parent.png/.txt`。|
|P2|通过|父轨迹一条子 read_file，参数 README.md、limit 5，结果首行正确，子会话 `c682dd08-bf73-4a46-b601-48ff531ebcaa`；已完成，16 毫秒。Schema 有 read_file 名称、描述、properties、required path、additionalProperties false。`fixed-explore-child.png/.txt`。|
|P3|通过|父最终回复“委派成功，只进行了一次 Explore 调用”，代码块准确包含首行。`fixed-explore-parent.txt`、`fixed-explore-reload-rows.txt`。|
|P4|通过|Cmd+R 后重新进入轨迹，仍一条 explore、一条子 read_file，最终回复保留。分别打开父子详情，成功状态与正确结果均保留，子 Schema 可见。`fixed-explore-reload-rows.txt`、`fixed-explore-reload-parent.png/.txt`、`fixed-explore-reload-child.png/.txt`。|
|P5|通过|另一新会话只调用一次 agent，父状态“已完成”，21:53:22.729，1.78 秒，返回正确首行；父轨迹子 read_file 已完成，结果与 Schema 可见，最终回复也含正确首行。未调用 explore、未重试。`fixed-agent-parent.png/.txt`、`fixed-agent-child.png/.txt`。|

## 修复前对照与边界

同环境修复前已单次复现：父 Explore 失败、子 read_file 成功，证据 `repro-parent.png/.txt`、`repro-child.png/.txt`。修复后的上述两次父工具均成功。

本报告只陈述真实界面观察；TaskLedger 根因、源码修复与日志检查由主智能体另行记录，不冒充 UI 证据。没有进行长时并发、故障注入、后台通知或其他 preset 的验证。

验收结束已 Cmd+Q 退出此隔离应用；未修改源码、未提交或推送。
