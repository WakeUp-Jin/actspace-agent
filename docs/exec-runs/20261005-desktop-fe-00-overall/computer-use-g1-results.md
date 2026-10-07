# G1 Computer Use 验收结果

- 日期：2026-10-07；执行者：`gpt-6.1-sol` 验收子智能体；只验收，不修复。
- 阶段状态：已完成现有 Electron 只读基线；G1 浏览器操作继续中，未完成项不预填通过。
- 版本：初始 `main f1a28c2f62cef2231b9935aeaeb1fa88e6333a0e`；中途文档提交后为 `d5f1bf3eb1f51346789349d57a06f17c18d64cd9`。源码为操作时现有 dirty Composer 工作区，不代表纯 HEAD。其他任务继续修改 Composer/ModelPicker 与测试/规范；本验收未修改这些文件。
- 真实环境 E-U/H：`com.actspace.desktop.dev.w2067fa05` / `Actspace Dev actspace-agent-2067`，窗口 `actspace`，renderer `127.0.0.1:5173/`。
- 所有交互经 `mcp__cua_repl`。Chrome extension inventory 报 `unsupported Codex auth method: apikey`，未修配置；后台 IAB 可创建且有 AX/Playwright/截图能力，但子智能体 `visible:true` 不支持。原生 Chrome 单次绑定成功，可见窗口与原生输入可用。原生 Electron/Chrome AX 与截图调用每次约 61 秒，是工具延时，不能据此判断产品响应时间。

## 验收点与路线

验收点：13-A6 分别覆盖 empty、long-session、streaming、approval-pending、remote-host；10-B1 完整深色轨迹 fixture；V01–V04、09-P3-4 仅浏览器补充；现有 Electron 窗口、活跃任务、设置入口与 17-A1 六页既有值显示基线。

操作分组：沿 G1 的 empty→long-session→streaming→approval-pending→remote-host→fixture 路线复用状态；主题/480px/360px 高补差异。Electron 只读设置沿通用→外观→Host→模型→搜索→工具→子 Agent→返回应用，未改任何值、未调用检测或真实服务、未重启。

## 现有 Electron 只读基线

| 项 | 结果 | 实际操作与现象 | 验证层/证据 |
| --- | --- | --- | --- |
| 窗口、设置入口 | 通过 | 按 bundle ID 绑定后看到真实消息、侧栏、Composer；点击设置打开设置中心；逐页切换后返回应用成功。display name 绑定失败，bundle ID 成功。 | 真实 Computer Use；[通用截图](screenshots/computer-use/g1/electron-general.png) |
| 活跃用户任务 | 未覆盖全部隐藏会话；可见范围无活跃任务 | 初始为 Harness Handbook 与行为定义解读，随后刷新AX时已经变成项目情况概览（未执行会话选择，旧ID点击报无效）。可见侧栏状态均空闲；Composer空、发送禁用、无停止按钮。侧栏有 Show more，不能宣称全84个session无活跃任务。返回应用后仍为项目情况概览且空闲。 | 真实 Computer Use；当场 AX 记录 |
| 17-A1 通用 | 通过 | 默认会话/轻量/Explore 均 deepseek-flash；性能监控off；名称/回复风格未设置；Agent指令1266字；图片 gpt-image-2 已配置；图片分析 GPT-5.6 Luna · OpenRouter；MiniMax Key已保存不回显，speech-2.8-turbo、English_radiant_girl、1.0×；快速唤起on、⌘⇧Space、指定会话已移除并提示降级。 | 真实 Computer Use；通用截图与 AX |
| 17-A1 外观 | 通过 | 浅色、默认强调色、系统默认界面字体14px、系统等宽代码字体13px；页面显示正常，未切换主题。 | 真实 Computer Use；AX |
| 17-A1 模型 | 通过 | DeepSeek默认已连接1/1；Moonshot已连接4/4；OpenRouter可用11/21；cheaprouter.cc Anthropic Messages可用。 | 真实 Computer Use；AX；状态显示不证明真实调用 |
| 17-A1 搜索 | 通过 | 允许联网搜索on；2/4已连接，智谱/Tavily已连接，TinyFish/Exa显示连接按钮。 | 真实 Computer Use；AX |
| 17-A1 工具 | 通过 | 代码库6/6 on；Bash on、执行前确认on；浏览器on；图片生成/分析on；显示写入变动on。 | 真实 Computer Use；AX |
| 17-A1 子 Agent | 不通过（可访问性值不一致）；可见既有值显示通过 | Explore组合框截图与子文本均显示 deepseek-flash，但原生AX Value为 `deepseek:deepseek-flash（不可用）`，与通用页和模型页已连接状态不一致。未实际调用，不能判定服务不可用；原因和引入版本未知。 | 真实 Computer Use；[子Agent截图](screenshots/computer-use/g1/electron-subagent.png)、当场 AX |
| Host前提 | 通过（确认列表为空） | Host页标题Agent服务器，仅有添加服务器表单：名称、WSS、地址、一次性配对码、配对并连接；没有已登记Host列表。没有配对操作。 | 真实 Computer Use；AX；真实Host专项前提缺失 |

17-A1 综合：六页已真实逐页观察；可见兼容显示正常，但子Agent可访问性值不一致，专项记录不通过，后续统一交接。其他17-A2–A5不由本基线代替。

旁支现象 G1-OBS-01：项目情况概览旧回复末尾显示 `Worked for 25338m 54s`；侧栏空闲、无停止按钮。目前只有显示观察，不能推断该任务仍运行，也未调查原因。下一段可补关键截图，现阶段不修改历史数据。

## 浏览器专项进度

| 项 | 结果 | 已做/剩余 |
| --- | --- | --- |
| 13-A6 empty | 未覆盖 | 后台 IAB 已打开empty，看到新建会话空态、工作区/运行位置、Composer；尚未完成交互与有界面路线。 |
| 13-A6 long-session | 未覆盖 | 尚未操作。 |
| 13-A6 streaming | 未覆盖 | 尚未操作。 |
| 13-A6 approval-pending | 未覆盖 | 尚未操作。 |
| 13-A6 remote-host | 未覆盖 | 尚未操作。 |
| 10-B1 | 未覆盖 | 尚未操作fixture。 |
| V01–V04、09-P3-4 | 未覆盖（浏览器补充待做） | 不映射为Electron通过。 |

边界：mock未实现hosts.call/preview/download、terminal.create、worktree、Git写；标准streaming不能证明真实pending队列。此类reject不当作缺陷。
