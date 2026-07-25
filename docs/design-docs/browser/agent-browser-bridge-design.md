# Agent Browser Bridge 设计

## 当前状态

本文档定义真实 Chrome Browser Bridge 的宿主、安装、传输和 backend 边界。Browser Use 当前完整架构入口见 `docs/design-docs/browser/agent-browser-use-index.md`；本文后半部分保留的 CLI-first v0 方案是历史阶段，不再代表 Agent 正常调用路径。

代码主位置：Browser Use / Browser Bridge 主线实现已经合并到当前仓库
`plugins/browser-bridge/`。
原独立仓库 `/Users/wakeup-jin/Desktop/code-project/side-project/agent-browser-bridge/`
保留为迁移来源与历史上下文。

当前结论：

- 浏览器主调用链采用 `Agent 分类工具 -> Unix socket -> Go Command Engine -> Extension primitive backend`。
- 本地桥接优先使用 Go 实现，而不是 Rust。
- 协议层必须存在，但保持为仓库内共享契约层，不单独包装成新的产品面。
- `actspace-agent` 默认不直接操作 Chrome extension，也不直接耦合 Native Messaging framing。
- Agent 正常浏览器任务使用 9 个分类工具加 `browser_help`、`browser_run`；CLI 用于安装、诊断、人工调用和机器可读帮助。
- 当前实现以 `extension backend` 接入用户真实 Chrome；独立 `cdp backend` 保留接口边界，但不属于 Plan 5 的实现范围。

## 设计目标

- 让 `actspace-agent` 能操作用户真实 Chrome profile，而不是自建无状态浏览器壳。
- 保持 Agent Runtime 与浏览器执行层解耦，避免把 extension、socket、Native Messaging 细节带进 `packages/agent-core`。
- 为后续 CLI、多轮 session、浏览器事件订阅和潜在 IAB backend 保留统一入口。
- 保持跨平台发布、安装、调试和本地排障成本可控。
- 让浏览器工具在 Agent 体系内仍然表现为普通工具能力，而不是特殊旁路。
- 让 CLI help、Agent action 列表、协议能力与文档状态从同一份 Go registry 派生，避免多处漂移。
- Agent Core 只保留稳定分类工具、审批、预览和 Socket client，不复制浏览器执行逻辑。

## 非目标

- 首阶段不在 `actspace-agent` 内直接实现 Chrome extension。
- 首阶段不让 renderer 或 main process 直接调用浏览器插件私有接口。
- 首阶段不把浏览器桥接做成常驻 daemon 平台。
- 首阶段不引入独立对外发布的协议 SDK 生态。
- 首阶段不把 MCP 作为主接入面。
- 首阶段不维护手写的独立浏览器 Skill 文档体系；只允许从安装状态生成薄 Skill 入口。
- 首阶段不覆盖除 Chrome route 之外的多浏览器抽象。

## 为什么选择 Go

相对于 Rust，本项目当前阶段优先选择 Go，原因不是功能上 Rust 做不到，而是 Go 更适合当前的交付目标。

- Go 更适合先把跨平台单二进制 CLI 和 native host 稳定做出来。
- Go 的交叉编译、CI 构建链和发布流程通常更直接，适合工具型项目快速迭代。
- 当前桥接层的核心工作是 IPC、中继、JSON-RPC、socket、安装脚本和跨平台分发，这些场景 Go 已经足够。
- 对团队协作和后续维护来说，Go 的心智负担更低，新增参与者更容易接手。
- 当前阶段最重要的是稳定边界和交付效率，不是极限资源控制。

Rust 的资源控制和类型建模优势依然成立，但在现阶段，这些优势不足以抵消更高的工具链复杂度和维护成本。只有当浏览器桥接层未来演进成高复杂度常驻基础设施，且 Go 在状态建模、资源约束或工程边界上明显成为瓶颈时，再重新评估 Rust。

## 总体架构

推荐架构如下：

```text
actspace-agent
  -> 9 category tools + browser_help + browser_run
  -> Unix socket
  -> Go browser command engine
     -> canonical registry / validation / session / orchestration
     -> extension backend

extension backend
  -> primitive RPC over Chrome Native Messaging
  -> chrome.tabs / chrome.debugger / chrome.history / chrome.tabGroups
  -> user's real Chrome profile

future cdp backend (not in Plan 5 scope)
  -> local DevTools endpoint or app-owned target
  -> Chrome DevTools Protocol
  -> controlled browser instance or future IAB page target
```

这个架构要点如下：

- `actspace-agent` 只消费稳定入口，不感知 extension 内部实现。
- Go bridge 既是 command engine、CLI，也是 Native Messaging host，并负责能力发现和 backend adapter。
- Chrome extension 只负责浏览器权限内的执行，不承担上层业务编排。
- 独立 `cdp backend` 不依赖插件，未来可作为无插件 fallback 或 IAB 执行基础，但当前不实现。
- “协议”同时包含传输 framing 和应用 RPC schema，两者都保留，但不一定分别对外发布。
- CLI 必须是 self-describing 的：帮助、能力、参数和 backend 约束优先由 CLI 自身输出，而不是外置 Skill 文本。

## 三层职责边界

### 1. Browser backend 执行层

browser backend 不是单一实现，而是统一接口下的两类后端：

- `extension backend`：面向用户真实 Chrome profile。
- `cdp backend`：面向可控浏览器实例、远程调试目标或未来 IAB 页面。

#### `extension backend`

职责：

- 连接本地 Native Messaging host。
- 调用 Chrome 原生 API，如 `tabs`、`debugger`、`history`、`downloads`、`tabGroups`。
- 执行 Go 传入的 tab group、active tab 和 deliverable 原语；高层 session 语义由 Go 管理。
- 向 host 回传结构化结果与事件通知，例如 CDP event、下载变化、file chooser、clipboard 结果。
- 提供真实用户浏览器表面，例如 user tabs、history、claim tab、finalize session tabs。

约束：

- 不承担 `actspace-agent` 的任务编排、工具权限判断和高层产品语义。
- 不把 provider、prompt、agent turn 细节塞入插件。
- 除浏览器执行所需最小状态外，不持有复杂产品状态。

#### `cdp backend`

职责：

- 直接连接 CDP target，例如本地 Chrome DevTools endpoint 或未来 IAB 的 `webContents.debugger`。
- 提供通用深层自动化能力，例如导航、执行 JS、监听生命周期、截图、输入事件、DOM/页面读取。
- 在未安装插件时提供有限但可用的浏览器自动化 fallback。

约束：

- 不承诺天然接管用户当前正在使用的普通 Chrome profile。
- 默认不提供 user tabs、history、claim tab 这类真实浏览器表面。
- 更适合作为自动化后端，而不是用户浏览器会话后端。

### 2. Go host / CLI 桥接层

职责：

- 作为 Chrome Native Messaging host 与 extension backend 通信。
- 对外暴露本地 socket 与 CLI 子命令。
- 维护 request/response 路由、多 client 连接和通知分发。
- 负责 backend 检测、浏览器安装引导、host manifest 注册和本地排障入口。
- 通过 canonical registry 提供 62 条高层 Browser Use 命令，并保留 `ping`、`doctor`、`capabilities`、raw `cdp` 等诊断入口。
- 通过 `help` / `schema` / `--json` 形态输出渐进式帮助信息，让 CLI 自身承担 Skill 式知识发现能力。

约束：

- 桥接层不直接承载 `actspace-agent` 的通用工具调度、上下文压缩和会话持久化。
- 不把 Agent Runtime 的产品规则混入桥接层。
- 只实现浏览器领域的 command 编排和会话状态，不抢占 Agent Runtime 的通用工具权限、上下文或产品调度职责。

### 3. actspace-agent 集成层

职责：

- 在 `packages/agent-core` 中把浏览器能力包装成稳定工具。
- 管理用户审批、工具预览、错误呈现、日志和模型可见摘要。
- 将 `actspace-agent` 的 `sessionId` / `turnId` 映射到浏览器桥接层的会话字段。
- 通过 BridgeClient 调用 Go command protocol，并决定何时向用户发起审批、如何展示 preview 和裁剪结果。
- 通过 `browser_help` 渐进加载 action schema，不要求模型通过 Bash 解析 CLI 帮助。

约束：

- 不直接操作 Chrome extension。
- 不直接实现 Native Messaging framing 或 socket 协议细节。
- 不把浏览器桥接层变成 renderer 私有能力；它应通过 Agent 工具入口进入执行链。

## 协议与通信设计

### 为什么协议层不能省

即使 bridge 使用 Go 实现，也不能“直接操作插件”。Chrome extension 与本地程序之间天然存在运行边界，必须通过明确通信通道完成调用。因此协议层不能删除，只能做薄。

必须明确的协议内容至少包括：

- 传输层 framing：消息边界、长度头、编码格式。
- 应用层 RPC：`method`、`params`、`result`、`error` 结构。
- 会话字段：`session_id`、`turn_id`、tab target、timeout 等。
- 通知事件：下载、CDP event、文件选择器、clipboard、turn end 等。

### 推荐做法

- 保留一个仓库内共享契约层，放消息结构、frame codec 和 JSON-RPC schema。
- 这个契约层可以是 Go 内部 package，也可以附带 TypeScript 类型定义或文档 schema，但不要求首阶段单独对外发布。
- `actspace-agent` 不直接依赖 framing 细节，只依赖更高层入口。

## 历史集成入口（CLI-first v0，已被替代）

> 这一节记录 Browser Bridge 独立仓库阶段的启动策略。首版验证 CLI 后，Agent 已经改为标准 `browser_*` 工具通过 Unix socket 调用 Go bridge。Plan 5 会进一步收敛为 9 个分类工具加 `browser_help`、`browser_run`。以下内容不得再作为新实现依据。

`actspace-agent` 作为使用方，默认不应站在 extension 边界，而应站在 CLI 边界。

推荐优先级如下：

1. self-describing CLI：首阶段主接入面。
2. 专用 browser tools：后续可在 `agent-core` 中包装，但内部仍调用 CLI。
3. 直连本地 RPC：仅在 `actspace-agent` 明确需要更细粒度控制且已经有稳定 client adapter 时再考虑。

默认建议：

- Phase 1 先保证 bridge 可以独立以 CLI 运行。
- `actspace-agent` 内先通过 bash 调用 CLI，并通过系统提示词要求模型先运行帮助命令。
- 浏览器能力在 Agent 体系内仍表现为标准工具或标准 bash 工作流，并遵守现有 preview、approval、日志和权限约束。

### ActSpace 初始化流程（历史 v0）

Browser Bridge 是 **host-bridge plugin**，初始化不能完全复用 `fs-watch` 的
spawn / heartbeat 模型：

- `fs-watch`：ActSpace build -> install binary -> 写 config -> main process spawn ->
  心跳判定运行状态。
- `browser-bridge`：ActSpace build -> install `abb` -> 注册 Chrome Native Messaging
  host -> 用户加载 Chrome extension -> Chrome 拉起 host -> `abb doctor --json` 判定
  socket / extension 状态。

v0 集成职责：

1. 设置页「插件」分区从当前仓库 `plugins/browser-bridge/` 构建 `abb`。
2. 安装位置约定为 `<userData>/plugins/browser-bridge/bin/abb`。
3. 成功安装 `abb` 后，ActSpace 在 `<userData>/skills/browser-bridge/SKILL.md`
   生成薄托管 Skill，内容只包含使用场景、`abb` 绝对路径和优先查看
   `help` / `doctor --json` / `capabilities --json` 的约束。
4. 点击「安装 Native Host」时运行
   `abb install-native-host --binary <userData>/plugins/browser-bridge/bin/abb --json`。
5. Chrome extension 仍由用户在 `chrome://extensions` 手动 Load unpacked，目录为
   `plugins/browser-bridge/apps/chrome-extension/`。
6. 设置页通过 `abb doctor --json` / `abb capabilities --json` 展示 ready 状态。
7. Agent 使用阶段仍通过 bash 调 `abb`。当 `<userData>/plugins/browser-bridge/bin/abb`
   存在时，ActSpace 注入 runtime prompt segment，要求先看 `abb help`、
   `abb doctor --json`、`abb capabilities --json`，并优先使用 Browser Bridge
   而不是 AppleScript 等通用 OS 自动化。

v0 不做：

- 不由 ActSpace 常驻 spawn `abb host`；host 生命周期交给 Chrome Native Messaging。
- 不直接操作 Chrome extension 私有 API。
- 不新增 `browser_*` 内建工具；等 CLI 路线真实稳定后再评估包装。

### 为什么不以 MCP 或手写独立 Skill 为主线

- `actspace-agent` 当前没有成熟 MCP 接入面，强行引入会放大系统复杂度。
- 手写独立 Skill 会和 CLI 命令面形成双重知识源，容易漂移。
- 托管 Skill 只负责让模型知道“这里有 `abb`”，不复制完整命令手册。
- 把渐进式帮助能力内建进 CLI，可以让“人类用户帮助”和“模型帮助”共用同一事实来源。

## CLI 自描述设计

CLI 不应只提供传统的一大段 `--help` 文本，而应提供渐进式、自描述、可机器消费的帮助面。

推荐至少提供：

- `abb help`：列出一级命令大纲与一句话摘要。
- `abb help <command>`：展示单个命令的用途、参数、backend 支持、前置条件和示例。
- `abb help <command> --json`：输出机器可读的命令 schema。
- `abb capabilities --json`：列出当前 bridge 支持的 backend、能力、限制和推荐 fallback。
- `abb doctor`：检查插件、native host、socket、CDP endpoint 等运行条件。

系统提示词的推荐策略：

- 首次使用浏览器能力前先运行 `abb help`。
- 调用某个命令前先运行 `abb help <command>`。
- 需要稳定参数格式时优先使用 `abb help <command> --json`。
- 需要确认当前环境可用能力时先运行 `abb doctor` 或 `abb capabilities --json`。

## actspace-agent 内的职责落点

推荐落点：

- `packages/agent-core`：浏览器工具定义、参数校验、用户可见 summary、错误适配、权限流程。
- `packages/shared`：如果需要前端消费稳定结构，再补共享契约；不提前把 bridge 私有结构泄漏给 renderer。
- main process：只负责必要的环境配置和本地可执行路径发现，不承载浏览器业务逻辑。
- renderer：只消费结构化工具事件，不关心 extension、socket 和 Native Messaging。

浏览器桥接相关逻辑不应直接散落在：

- renderer 页面组件
- Electron IPC handler 的业务分支
- 任意 Bash 字符串拼接命令

## backend 能力分工

### 核心抽象

这份设计文档采用一个高层抽象来约束后续所有能力归属：

- 插件管宿主。
- CDP 管执行。

更完整地说：

- `extension backend` 负责把 Agent 接入用户真实浏览器上下文。
- `cdp backend` 负责在具体页面 target 上执行深层自动化和观察逻辑。

后续如果某个能力归属不清晰，优先按这条原则判断：

- 如果它主要依赖“用户真实浏览器宿主语义”，优先归 `extension backend`。
- 如果它主要依赖“页面级执行或观察原语”，优先归 `cdp backend`。

### `extension backend` 的主要价值

适合提供这些能力：

- 列出用户真实浏览器 tab。
- claim 用户当前 tab 进入 session。
- 读取用户 history。
- 使用 tab group 表示 session 和 deliverables。
- 在用户真实 Chrome profile 中持续操作任务页面。

这些能力依赖插件接入真实浏览器宿主，因此属于 `extension-only`。

### `cdp backend` 的主要价值

适合提供这些能力：

- 导航、刷新、前进后退。
- 执行页面 JS。
- 读取 DOM / 文本 /属性。
- 派发键鼠输入和滚动。
- 获取页面截图或视口截图。
- 监听页面生命周期和 Runtime/Console 事件。

这些能力更接近深层自动化原语，适合作为 `cdp-compatible` 公共能力。

### 能力边界表

| 能力 | 首选归属 | 原因 |
| --- | --- | --- |
| 列出真实用户 tabs | `extension backend` | 属于用户浏览器宿主表面 |
| claim 当前用户 tab | `extension backend` | 需要把用户现有 tab 纳入 session |
| 读取 history | `extension backend` | 属于浏览器级信息表面，不是页面原语 |
| session tab group / deliverables | `extension backend` | 属于浏览器宿主组织能力 |
| 接入用户真实 Chrome profile | `extension backend` | 这是插件路线的核心价值 |
| 导航 / 刷新 / 前进后退 | `cdp backend` | 属于页面 target 控制原语 |
| 执行页面 JS | `cdp backend` | 属于页面运行时控制 |
| DOM / 文本 / 属性读取 | `cdp backend` | 属于页面观察原语 |
| 截图 | `cdp backend` | 属于页面观察原语，即使经由插件实现，本质也走 CDP |
| 键盘 / 鼠标 / 滚动 | `cdp backend` | 属于页面输入执行原语 |
| 生命周期 / Console / Runtime 事件 | `cdp backend` | 属于页面运行时观测原语 |

补充说明：

- `extension backend` 内部完全可以复用 CDP 执行很多操作，但这不改变能力的产品归属。
- 当一个能力需要“接入真实用户浏览器上下文”与“深入操作页面”两部分时，通常是 `extension backend` 提供宿主入口，再由其内部复用 CDP 完成具体执行。
- 未来 `iab backend` 若引入，也应尽量复用 `cdp backend` 这一执行抽象，而不是重新定义一套页面操作语义。

### 文本读取与截图职责划分

页面观察不要简单按“插件做这个、CDP 做那个”切分，而应按**观察目标**切分。

- 文本型页面，例如百科、文档、设置页：
  - 优先使用 DOM / 文本抽取。
  - 原因是结构化文本更适合模型读取、检索和后续引用。
- 视觉密集页面，例如商品详情、复杂营销页、瀑布流、图文混排页面：
  - 优先使用截图观察。
  - 原因是 DOM 节点过多、样式层级复杂时，纯 HTML 文本会丢失大量版面语义。

截图能力不应被理解为“插件专属能力”。更合理的归属是：

- 截图能力优先归入 `cdp backend` 的通用能力面。
- `extension backend` 如果已接入 `chrome.debugger`，也可以通过该路径提供截图，但本质上仍然是 CDP 能力，而不是插件特有能力。

所以职责划分建议如下：

- 插件的核心职责：接入真实用户 Chrome 表面与浏览器宿主权限。
- CDP 的核心职责：提供深层页面自动化与观察原语，包括截图。
- 当 `extension backend` 存在时，它内部也可复用 CDP 完成截图、输入、evaluate 等操作。

### 对未来 IAB 的意义

未来如果引入 `iab backend`，它最自然的执行基础也是 CDP，而不是插件。

- `extension backend` 的目标是用户真实 Chrome。
- `iab backend` 的目标是应用内页面容器。
- 两者共享的深层执行语言都应尽量收敛到 CDP 抽象。

## 第一阶段范围

第一阶段最小范围建议如下：

- host / CLI 可安装、可注册、可检测 extension 连接状态。
- 支持 `help` / `help <command>` / `help <command> --json` / `doctor` / `capabilities --json`。
- 支持 `ping`、`info`、`tabs`、`user-tabs`、`open-tab`、`navigate`、`claim-tab`、`finalize-tabs`。
- 支持基础 `cdp` 调用，至少覆盖 `Runtime.evaluate`、`Page.navigate`、`Page.captureScreenshot` 这类核心能力。
- 支持 `actspace-agent` 通过单一受控入口触发浏览器工具。
- 支持把桥接层错误转成 Agent 可解释错误，而不是裸 stderr。
- 支持在无插件时退化到 `cdp backend` 的有限可用模式。

第一阶段暂不要求：

- 复杂视觉自动化。
- 多浏览器统一抽象。
- 独立 daemon 化部署。
- 完整 SDK 生态同步交付。
- 完整 IAB backend。
- 深度站点策略系统。

## 风险与取舍

- 如果 `actspace-agent` 过早直接依赖 extension 或 framing 细节，后续 bridge 演进会非常痛苦。
- 如果 bridge 过早承载产品编排逻辑，会让浏览器项目和 Agent Runtime 边界失真。
- 如果首阶段同时推进 CLI、MCP、SDK、daemon、多浏览器，会显著放大复杂度，削弱交付速度。
- 如果帮助系统只做纯文本 `--help` 而不提供结构化 schema，模型使用稳定性会明显变差。

当前推荐取舍：

- 先稳定 Go bridge 的边界。
- 先让 `actspace-agent` 作为使用方接入，而不是在主仓库里复制实现。
- 先做 self-describing CLI，再基于真实使用反馈决定哪些能力升级成 `agent-core` 专用 browser tools。
- 先做 `extension backend + cdp backend` 双路线，再决定是否继续引入 IAB。

## 后续演进方向

- 如果 CLI 接入证明稳定，再评估把常用浏览器命令升级为 `agent-core` 内建工具，但底层仍复用 CLI。
- 如果浏览器事件订阅和多 client 生命周期明显变复杂，再评估 daemon 方案。
- 如果 bridge 需要被多个项目复用，再评估是否把协议契约抽成更明确的共享模块。
- 如果应用内浏览器场景变强，再引入 `iab backend`，并尽量复用 `cdp backend` 抽象。
- 如果跨平台发布和维护压力转向资源控制瓶颈，再重新评估 Rust。
