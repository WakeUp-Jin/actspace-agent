# DeepSeek 搜索与网页读取 Computer Use 验收

日期：2026-10-18。执行模型：gpt-6.1-sol。仅验收，未改产品代码、未调用模型或搜索/抓取付费接口。

## 验收点与操作分组

- A1：设置入口、五来源、并行聚合说明、费用。
- A2：DeepSeek 搜索/抓取默认关闭；缺 Key 不能开启。
- A3：来源独立启停，其他来源保持；设置页往返后状态一致。
- A4：模型/搜索/抓取共享 Key 与更换影响提示；抓取独立。
- A5：浅/深主题、480px 窄窗、键盘操作。
- A6：隔离 Electron 保存、重开持久化。

分组：①浏览器 mock 设置主路线集中覆盖 A1–A4；②复用设置路线覆盖主题/480px/键盘 A5；③隔离 Electron 真实窗口覆盖 A2 缺 Key 与 A6。分组不替代逐项结果。

## 环境与证据边界

浏览器：`http://127.0.0.1:5198/?mock=empty`，通过 cua 操作真实 renderer，但 bridge 为 mock。mock 初始预连接 DeepSeek 模型 Key，因此搜索页显示 DeepSeek 已连接；这不是无 Key 场景。只向 mock 输入 `fixture-zhipu-key`、`fixture-tavily-key`，mock 不保存真实凭据。

Electron：从 dev 日志核对 `Actspace Dev 6e80-a42c` / `com.actspace.desktop.dev.wa42c26db`；窗口确实加载应用，工作区显示 `/tmp/actspace-deepseek-cu-workspace`，设置页曾显示隔离目录 `/tmp/actspace-deepseek-cu-data/prompts/main-agent.md`。原生 CU AX 观察反复约 60 秒，操作遇到 element ID no longer valid；截图随后回到主界面，坐标重试也未形成可确认的设置状态。开发期曾有 HMR；停止改动后仍不能可靠继续。未以此认定产品 Bug。

## 逐项结果

| 子项 | 结果 | 实际验证与证据 |
| --- | --- | --- |
| A1 入口 | 通过（mock UI） | 设置导航“搜索与网页读取”可进入。 |
| A1 五来源/聚合/费用 | 通过（mock UI） | DeepSeek、智谱、Tavily、TinyFish、Exa 均显示；文案说明三通道并行、去重融合、分别计费及国际通道回退次序；各行有费用说明。见 `evidence/mock-dark.png`。 |
| A2 默认关闭 | 通过（mock UI） | 初次进入时 DeepSeek 搜索=0，抓取=0；DeepSeek 已预连接不导致自动开启。 |
| A2 缺 Key 禁止开启 | 未覆盖 | mock 已预连接 DeepSeek；真实 Electron 原生 CU 受限，未成功进入该页检查。不能从默认关闭推断缺 Key 禁用。 |
| A3 三来源均开 | 通过（mock UI） | mock 连接智谱/Tavily，观察 DeepSeek=1、智谱=1、Tavily=1，3/5 已连接；TinyFish、Exa 仍未连接。 |
| A3 关闭 DeepSeek | 通过（mock UI） | 从三者均开关闭 DeepSeek，观察 DeepSeek=0、智谱=1、Tavily=1。见 `evidence/mock-three-ds-off.png`。 |
| A3 关闭智谱 | 通过（mock UI） | 再开启 DeepSeek、关闭智谱，观察 DeepSeek=1、智谱=0、Tavily=1。见 `evidence/mock-three-zhipu-off.png`。 |
| A3 设置页往返 | 通过（mock UI） | 键盘开启 DeepSeek 后切换外观并返回，DeepSeek 仍为1、抓取仍为0。仅证明内存 mock 状态，未证明落盘。 |
| A3 TinyFish/Exa 独立切换 | 未覆盖 | 两行存在且仍未连接；没有逐一配置与切换，不能声明所有来源逐一通过。 |
| A4 共享 Key 提示 | 通过（mock UI） | DeepSeek 行说明共用模型/抓取官方 Key；“管理→更换 Key”展开输入框，明确“更换会影响三者”“Key 只保存在本机，不会回显”；空输入保存禁用。 |
| A4 抓取独立 | 通过（mock UI） | 观察搜索0/抓取1组合；后续搜索1、智谱0、Tavily1时将抓取1→0，三搜索状态保持。见 `evidence/mock-independent.png` 和 `evidence/mock-three-zhipu-off.png`。 |
| A5 浅/深主题 | 通过（mock UI） | 在外观切换两主题后回到搜索页；文字、费用、边界和开关可辨。见 `evidence/mock-dark.png`、`evidence/mock-480-light.png`。 |
| A5 480px | 通过（mock UI） | viewport 480×800，导航横向滚动，内容纵向滚动，来源行文字换行、连接/管理按钮可用。完成后恢复默认 viewport。见 `evidence/mock-480-dark.png`、`evidence/mock-480-light.png`。 |
| A5 键盘代表操作 | 通过（mock UI） | 使用 Space 在“启用 DeepSeek 搜索”上将0→1，AX显示1与“已保存”。仅代表开关键盘操作，未遍历全部Tab顺序或所有弹层键盘路线。 |
| A6 真实窗口启动 | 通过（真实 Electron） | 正确隔离应用窗口显示新会话与隔离工作区，设置页曾通过 AX读取。 |
| A6 真实保存/重开 | 未覆盖 | 原生CU工具受限，未输入Key、未确认真实开关保存、未重开，不能声明持久化通过。主智能体如以工程方式补验应另列证据。 |

## 问题与限制

本次未确认产品 UI Bug。原生 Electron CU 工具受限影响 A2 缺 Key 和 A6 持久化验收；没有继续无限重试。未执行任何真实外部 API，费用文案出现不代表计费请求已验证；并行聚合、错误回退等运行时行为需工程测试或单独真实凭据验收。

证据只覆盖关键状态，未保存每个中间操作截图；上述每一状态均在操作当场读取 AX 核对，没有用终点截图推断所有中间步骤。
