# 近期新增功能统一验收

日期：2026-10-18。开始时：`main`，工作区干净；验收版本 `a13f8a1ee10eed387da575d80ac000cc844f2bff`。本轮不修改产品源码、正式测试或既有文档，不修复 Bug，不提交/推送。

## 范围和判定方式

范围依据本地 Git 合并记录，取 2026-10-11 至 18 日合入 main 的近期功能。两项工作都在当前聊天完成；没有新建其他用户任务。前端交互按 AGENTS 委派指定 `gpt-6.1-sol` 执行；主智能体负责工程检查、只读定位和 DOCS 审计。

| 功能范围 | 对应合并 / 变更 | 本轮交互记录 |
| --- | --- | --- |
| Context 面板、SQLite 读模型 | PR #2 / `42b8ba40` | Desktop C01–C06 |
| 轨迹、流式、统计、交付卡、模型连接 | PR #3 / `3ba669d6` | Desktop T01–T06、U01–U02、D01–D03、M01–M02 |
| 默认工作区、侧栏及统一验收修复 | PR #4–7 / `00e5a159`、`0df19d0c`、`26175b4d`、`9fb607a2` | Desktop S01–S05、B01–B06；旧 MN01–MN04 当前版本复验 |
| DeepSeek 搜索/抓取及多来源搜索设置 | PR #8 / `94b38e02` | Desktop W01–W04 |
| 官网 V4 首页、截图讲解与内容导航 | PR #9 / `b119ebb5` | Site S01–S25 |
| Web/PWA 客户端 | PR #10 / `a13f8a1e` | Web W01–W24 |
| Space 开发演示、主题及窗口尺寸 | 近期功能关联面 | Desktop P01、V01–V02；不等同真实协作 Runtime |

逐项验收点和操作分组已在执行前列入两个分报告。验收点界定范围，分组只复用页面状态；结果回到验收点，不以分组完成替代全部子项通过。

证据分为原生 Computer Use、真实 Host 的浏览器工程 UI、受控 Provider/测试数据、源码检查、自动化测试。未知或未执行均保留未覆盖；受控模型不能证明真实外部 Provider、真实计费或网络质量。

## 初轮交互验收结果

初轮确认三个产品问题：Web 停止/失败后缺恢复入口（WA01）、窄屏审批按钮触控高度不足（WA02）、Desktop 最小宽度附近 Composer/Context 左侧越界（DA01）。随后真实连接补验新增 DA02/DA03，累计五个，详见 [Bug 交接](bugs.md)。Desktop 使用原生 Electron Computer Use；浏览器 tab API 创建受认证限制，Web/官网工程 UI 结果不能记作原生 Computer Use 通过。

Web/官网工程 UI 共49点：30通过、3失败、16未覆盖，其中14点已经实测部分子项，但不能按完整验收点计为通过。Web 为7通过、3失败、14未覆盖；官网补齐既定键盘、滚动锁定、目录几何与锚点动画后，为23通过、0失败、2未覆盖。3个失败点中两个关联同一WA01，不能重复计为三个Web Bug。原生浏览器CU的49点均因CU-B01未覆盖，与这张工程台账分开统计。

Desktop原生CU共37点：14通过、1失败、22未覆盖，其中14点已验证部分子项。合并各自实际方法的86点台账为44通过、4失败、38未覆盖（其中28点有部分证据）；这是覆盖索引，不是统一方法下的通过率。4个失败点对应3个产品Bug。对真实Provider、真机和缺少合法fixture的场景，不能用工程测试或源码存在抵消未覆盖。

| 范围 | 实际方法 | 通过 | 失败 | 未覆盖 |
| --- | --- | ---: | ---: | ---: |
| Desktop 37点 | 原生Electron Computer Use | 14 | 1 | 22（14点含部分证据） |
| Web 24点 | 独立浏览器工程UI + 真实隔离Host | 7 | 3 | 14（12点含部分证据） |
| 官网 25点 | 独立浏览器工程UI | 23 | 0 | 2（均含部分证据） |

- [Desktop 逐项验收](desktop-acceptance.md)：37 个验收点、7 条操作路线，覆盖边界和原生证据逐项列出。
- [Web/PWA 与官网逐项验收](web-site-acceptance.md)：Web 24 点、官网 25 点，各自列明实际执行及限制。
- [真实连接补充验收](real-provider-acceptance.md)：用户进一步授权后，沿用应用管理的真实 `deepseek-flash` 连接，以原生 Computer Use 补查8点，结果单独统计。
- [Bug 与后续修复交接](bugs.md)：已确认缺陷、工程门禁失败、复现证据和定向复验要求。

本轮截图在相邻 `screenshots/`，按仓库约定为本地证据、不随仓库分发。临时 JSON、脱敏 Provider 记录及工程日志在 `tmp/codex-acceptance/`；不能假设其他克隆具备这些本地文件。

## 真实连接补验结果

用户授权使用已有真实 Key 后，指定 `gpt-6.1-sol` 在当前 HEAD 的固定构建开发实例执行原生操作，沿用应用自行管理的现有凭据；不读取、复制或输出原始 Key。测试只进入3个新会话、2个专用临时 Git 工作区，没有向既有业务会话发送请求。旧安装包缺近期功能且无法核对 commit，仅查看设置、未发送请求，不作为本次签收版本。

补验8点为 **5通过、2失败、1未覆盖**，不与初轮86点直接相加为统一通过率，也不把重叠子项机械改为整点通过：

| 点 | 结果与依据 |
| --- | --- |
| R01 | 通过：当前实例、实际模型及专用会话确认 |
| R02 | 失败 DA03：真实流式、正文、live用量及 Context 已验证；历史轨迹计时缺失 |
| R03 | 通过：真实 Thinking OFF/ON、运行展开/完成折叠、轨迹模型与思考正文 |
| R04 | 通过：真实 Bash 单次允许/拒绝、前缀复用、不同前缀再审批和会话隔离 |
| R05 | 失败 DA02：路径别名工作区漏改动卡；物理路径的单/多文件卡、第N轮Review、present预览、系统TextEdit/Finder子项通过 |
| R06 | 通过（已配置来源范围）：DeepSeek搜索/抓取真实返回，原智谱/Tavily组合也返回，设置已恢复 |
| R07 | 通过：带时间戳补查真实停止，后台aborted/cancelled；部分正文保留、已暂停队列、显式继续后单次执行、刷新无重复，停止轮未知用量未伪造 |
| R08 | 未覆盖：native Chrome可读，但没有完成本轮真实Provider Web Host路线；未转存桌面Key |

新增 DA02 为合法路径别名导致轮尾改动卡漏显示，DA03 为精简历史后轨迹详情丢失可从完整日志重建的 TTFT、生成时长和 TPS。两项均有原生截图、仅本轮验收会话的数据对账及只读源码定位；未修复。费用字段是应用估算，未核对服务商实际账单；组合搜索也未宣称逐来源独立调用成功。全部证据和剩余子项见补验报告。

## 工程验证

以下为本轮当前版本实际运行结果。构建及测试不替代原生系统操作、真机、真实 Provider 等人工验收。仅列执行的包/门禁，不声称全仓所有测试都运行。

| 检查 | 本轮结果 |
| --- | --- |
| `pnpm --filter @actspace/desktop build:deps:dev` | 通过，51 个项目的依赖闭包与默认 Harness 构建 |
| Desktop `build:renderer` / `build:electron`、CLI `build` | 通过；renderer 的 highlight 优化/大 chunk 警告保留，不直接判产品 Bug |
| Web `build`、Site `build` | 通过，Site 46 页。首次 Web 构建缺本地 tsc，`pnpm install --frozen-lockfile` 恢复后成功；manifest/lockfile未改 |
| Desktop `typecheck` | 通过 |
| Site `check` | 通过，51 文件，0 errors / warnings / hints |
| Desktop `test` | 238 文件通过、2 文件跳过；1,928 项通过、7 项跳过 |
| Web `test` | 25 文件、95 项通过 |
| Site `test` | 4 文件、23 项通过 |
| Client `test` | 7 文件、26 项通过 |
| Agent Host `test` | 20 文件、55 项通过 |
| Web tools `test` | 3 文件、19 项通过 |
| Tools runtime `test` | 4 文件、38 项通过 |
| Shell tools `test` | 3 文件、75 项通过 |
| Session projection `test` | 3 文件、18 项通过 |
| Context engine `test` | 10 文件、23 项通过 |
| Context compaction `test` | 4 文件、17 项通过 |
| Core agent loop `test` | 8 文件、41 项通过 |
| Runtime `test` | 19 文件通过、1 文件失败；55 项通过、`tool-composition` 1 项在 15 秒超时。独立重跑同项仍超时，见 ENG01 |
| Agent service `test` | 6 文件、33 项通过 |
| Tools approval `test` | 1 文件、1 项通过 |
| `pnpm test:agent-host:process` | 7 项通过：真实 Host 进程的执行、生命周期、工具、回执、恢复受阻及父子排空等路径 |
| `check:frontend-tokens` / `check:frontend-theme` | 通过，Desktop/Web token 与主题门禁 |
| `check:renderer-bridge` / `check:ipc-channels` | 通过，588 renderer 文件与167通道（invoke155/send1/event11） |
| `pnpm check:docs` | **失败，17 处既有资源/链接失效**，见 DOC00 和 DOCS 计划；本轮没有修复 |

去重按测试项计算：本轮上述测试 **2,454 通过、1 失败、7 跳过**；独立重跑的同一失败不重复计数。文档门禁另计。Desktop 跳过项为轨迹性能 5 项、SSH 1 项、editor POC 1 项；源码中的 skip 不作为当前环境性能、SSH 或 editor 对应行为的通过证据。

本地原始日志：`tmp/codex-acceptance/20261018-recent/engineering/desktop-test.log`、`runtime-test.log`、`runtime-tool-composition-recheck.log`、`host-process-test.log`、`service-approval-test.log`；其他测试和构建的汇总来自本轮命令结果，没有借用历史数字。

## DOCS 检查交付

[DOCS 检查与清理计划](../20261018-docs-audit/cleanup-plan.md) 列明 DOC01–DOC13 漂移、31 个建议迁出 Demo、2 个暂缓项和8个保留 HTML。拟备份至桌面，先复制/哈希/依赖验证再移除原件；本轮没有创建备份，没有删除/移动/更新既有 DOCS。

## 剩余验收边界

- 真实外部 Provider 的长回复流式、Thinking ON/OFF、已配置搜索/抓取及系统文本打开已有补验证据；实际账单、未配置来源和故障分支仍未覆盖，不得由 synthetic Provider 推断。
- iPhone Safari / Tailscale、键盘与安全区、主屏安装和锁屏恢复需真机；桌面浏览器模拟不能替代。
- 当前没有现场条件的长明细分页、故障恢复和未遍历的系统应用/文件组合等按分报告实际结果保留，不用已有单测或代表样例抵消。
- Context L 大库剩余长测此前已由用户取消，本轮不重新启动，也不标为通过。
- Web 原生浏览器 CU 认证限制、Runtime 超时和17处文档检查失败必须在签收时可见。

初轮自有Electron、Host、Provider、代理、独立浏览器及preview均已关闭，8个测试端口无监听；真实补验实例原生CmdQ退出，runner52129退出码0；随后仅重开runner19669定向补齐R07并再次退出，搜索设置恢复并刷新核对。基线HEAD未变，Git改动仅为新增本轮8份Markdown报告。验收完成表示本轮可执行检查和交付已完成，不能解释为所有功能无Bug或所有未覆盖项已签收。
