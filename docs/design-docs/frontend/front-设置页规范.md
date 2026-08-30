# 设置页规范

## 定位

设置页是独立于聊天态的页面级视图，用于承载应用配置，不作为聊天页右侧附属面板存在。

对应执行计划：[`docs/exec-plans/completed/20260529-settings-page.md`](../../exec-plans/completed/20260529-settings-page.md)。

## 切换规则（整页接管）

- 用户在聊天态点击左侧底部 `Settings` 后进入设置态。
- 进入设置态后，**原左侧会话栏整体替换为设置导航**（不是在聊天侧栏之外再叠一栏）。
- 右侧主区域同步替换为设置内容区，聊天态右侧文件/diff 面板在设置态强制关闭。
- 设置态与聊天态共享同一应用外壳，复用现有 `view` 切换机制。
- 左上角提供「返回应用」回到聊天态。

> 实现落点：`WorkbenchLayout` 在 `view === "settings"` 时，左槽渲染 `SettingsNav`（替换 `Sidebar`）、主槽渲染 `SettingsPage`；`Sidebar` 底部已存在的 `Settings` 按钮接 `onSelectView("settings")`，并挂 `⌘,`。设置态左栏固定窄宽、禁用 hide/resize 的 snap。

## 布局

设置页采用两栏结构：

- 左侧：设置导航列表（窄而稳定）。
- 右侧：当前设置项详情内容。
- 滚动归属：设置页根容器固定为整窗高度，左侧导航不参与页面滚动；纵向滚动只发生在右侧设置内容区。
- 窗口不超过 `820px` 时降级为上下结构：设置导航变成顶部横向可滚动列表，内容区独占剩余宽度。
- 窗口不超过 `600px` 时，分区标题与操作按钮、设置项说明与控件改为上下排列；内容边距收敛到 `16px`。

### 左侧设置导航

- 保持窄而稳定的宽度，纯列表导航，不做聊天会话展示。
- 当前分区：
  - `通用 General`
  - `快捷键 Shortcuts`
  - `服务商 Providers`
  - `模型 Models`
  - `成员 Members`
  - `智能体 Agent`
  - `工具 Tools`
  - `扩展 Host Extensions`
  - `Skills`
  - `外观 Appearance`
  - `归档会话 Archived Chats`
  - `分析观测 Analysis`（数据浏览分区，单会话详情再进入独立工作区）
  - `更新 Update`
- 当前选中项使用轻量高亮背景，延续聊天态侧栏的克制视觉，不变成后台控制台。

### 右侧设置内容区

- 以表单和配置分组为主：清晰的标题、分组标题、说明文本、开关、下拉和输入控件。
- 版式节奏与聊天页保持一致，不追求复杂卡片感，优先静态可读与操作稳定。
- 内容列保持适中的阅读宽度，大窗口下不横向铺满；右侧可以保留自然留白。
- 「分析观测」属于数据型例外：会话索引允许使用更宽的内容列，但仍由右侧内容区独立滚动，不增加第三栏。

### Ink & Emerald 视觉职责

- 左侧导航 selected 使用中性灰底和主文字，不使用蓝色或绿色选中条。
- 设置分组使用 `surface-subtle` 建立层级，避免每组同时出现白卡、边框、大圆角和阴影。
- Toggle 开启、已连接和运行健康使用 operational green。
- 普通保存 / 确认主操作使用 ink action，不把所有按钮做成绿色。
- 风险设置、审批等待和额度临界使用 warning；断开、删除和失败使用 danger。
- 输入框、下拉和 segmented control 的普通 focus 使用高对比中性 ring；只有 operational 控件才允许绿色 focus 反馈。

## 各分区内容（首版定稿）

> 字段到后端的精确绑定、IPC 契约与生效机制以执行计划 `20260529-settings-page.md` 为准，本节只描述信息架构。

- 通用 General
  - 权限设置 ·「默认权限」：占位开关（暂不接逻辑）。
  - 权限设置 ·「自动审查」：开 = 每条 bash 命令执行前都要确认（绕过 allowlist，硬拒绝仍生效）。
  - 通用 ·「语言」：固定「简体中文」。
  - （已删除「工作模式」「完全访问」两条。）
- 快捷键 Shortcuts
  - 首版只提供「快速打开 Actspace」一个系统级快捷动作，默认启用 `CommandOrControl+Shift+Space`，macOS 显示为 `⌘⇧Space`。
  - 快捷键使用录制按钮而不是自由文本输入；只接受至少包含一个修饰键的组合键，`Escape` 退出录制，支持恢复默认。
  - 打开目标分为自动、指定工作区和指定会话。指定工作区始终创建空会话；指定会话恢复原会话；自动使用侧边栏排序后的第一个非默认、非隐藏项目。
  - 保存的目标已被删除或隐藏时退回自动选择；没有任何项目时进入空白 New chat。
  - 系统注册失败时显示占用错误并保留上一个有效快捷键。快捷键注册状态属于 main 进程运行态，不伪装成持久化配置。
  - 唤起后主窗口收敛到约 `640px` 宽并在当前屏幕居中，复用现有 compact layout；Composer 在目标路由完成后获得焦点。
- 模型 Model（按供应商而非按模型，参考 OpenCode）
  - DeepSeek / Kimi 供应商卡，徽标显示是否已连接。
  - 未连接「连接」→ API Key 输入弹窗；已连接「断开连接」。
  - 「测试连接」按钮校验 Key 是否有效。
  - 「网络搜索」组：智谱 Web Search / Tavily / TinyFish / Exa 四个搜索供应商行（`web_search` 工具的通道 key，见 `docs/design-docs/tool-system/agent-web-tools.md`），仅连接/断开，无测试连接；Tavily 已连接时显示本周期 credits 用量（main 进程代理 `GET /usage`）。
  - 「默认模型」下拉，决定 Composer 初始选中模型。

### 多供应商模型设置（已落地，待统一手动验收）

当前实现以 `docs/design-docs/model-context/agent-multi-provider-llm.md` 为事实来源：

- 左侧新增独立的「服务商」分区；现有「模型」分区从连接供应商改为管理已添加模型与任务模型，不再混合连接信息。
- 「服务商」管理 DeepSeek / Kimi / OpenRouter 的 API Key、Base URL、连接测试、完整移除和服务商级代理。OpenRouter 允许配置独立 Management Key，只用于调用 `/credits` 查询账户余额，不参与模型请求、连接测试或目录请求。代理只影响开启它的服务商；搜索供应商仍留在工具相关设置，不并入 LLM 服务商。
- 服务商首屏只展示已连接项，按「官方 API（直连）」与「第三方 / 中转兼容」分组；页面右上角统一提供「添加服务」，先选择未连接服务商，再进入凭据表单。每个服务商使用桌面端两列、窄窗单列的紧凑卡片：头部承载身份、连接状态和测试/编辑/移除操作，中部统一展示账户余额与刷新状态，下方信息区展示可用模型、接入方式、接入地址与代理状态。移除前必须二次确认；成功后清除该服务商全部 Key、Base URL、代理和连接状态，使其回到「添加服务」，但保留模型、历史会话和用量记录。进入页面时自动刷新一次，停留期间每 5 分钟刷新，失败保留上次成功结果。
- 已开启代理的编辑弹窗不回显代理地址；留空表示保持原值，输入新地址表示替换，关闭代理开关表示清除。只有首次开启代理时才要求填写地址，避免只修改 Management Key 等其他字段时被旧代理配置阻断。
- “联网搜索服务”保持独立的横向列表，不复用 LLM 服务商卡片；每个搜索服务占一行，左侧显示名称、连接状态与说明，右侧显示连接/断开操作，底部保留 Tavily 用量信息。
- “图片生成服务”同样保持独立，但首屏只使用一行摘要卡片：显示「已配置 / 未配置」、当前模型、服务地址 host 和 Key 安全保存状态。API Key、Base URL 与模型名称统一在弹窗内编辑，其中 Base URL / 模型名称默认折叠为高级设置；已有 Key 不回显，断开入口留在编辑弹窗左下角。由于保存过程不发起连接探针，不使用「已连接」措辞。
- 「模型」顶部提供主会话默认模型、轻量任务模型和 Explore 模型选择；候选项统一来自已经连接、已添加、已启用且能力匹配的模型，并按供应商分组。跨供应商同名模型在选项文字中追加供应商名称，确保原生 Select 收起后仍可辨识。
- 模型按服务商分组展示，可独立启用或停用。OpenRouter 首次连接自动加入少量推荐模型，并支持从远端模型目录搜索、筛选和添加其他模型。
- 大模型目录采用搜索优先、渐进披露和列表虚拟化；所有状态同时用文字与图标表达，交互支持键盘访问，并继续遵守浅色 / 深色主题 token 规范。

### 已移除供应商

DuckCoding 不再作为文字模型供应商出现在设置、模型管理或 Composer 中。历史 settings 中的 DuckCoding 文字模型和凭据会在加载时清理；图片生成仍使用独立的 OpenAI-compatible Images API 配置，可继续指向 DuckCoding 默认地址。

- 成员 Members（事实来源 `docs/design-docs/collaboration/agent-members.md`）
  - Member 是跨多个 Room 持久存在的 Agent 身份，不是某个 Room 内临时复制的角色。V0 只管理 Agent，不展示 Humans、邀请或 Owner/Admin 权限。
  - 首屏显示成员列表，顶部主操作为「创建 Agent」；每项展示图标、名称、描述、状态文字、模型和已加入 Room 数量。
  - 点击成员后，右侧内容区切换为成员详情；成员列表不继续常驻成第三列。详情提供「返回成员列表」，返回时恢复列表滚动位置。
  - 成员详情顶部固定身份区（图标 / 名称 / 描述 / idle-working-error-offline 状态）和四个局部 Tab：Profile / Activity / Reminders / Workspace。
  - Profile：基本资料（名称、图标、描述、Persona）、运行配置（模型、推理等级）、能力（Web Research、项目只读、Skills）、使用情况（当前加入 Room，可跳转）。
  - Activity：跨 Room 的结构化脱敏活动日志，展示时间、事件类型、摘要和 Room 跳转；不展示 Chain of Thought、完整 Prompt、秘密或未经裁剪的工具输出。
  - Reminders：V0 只展示「后续支持」空状态，不提供无法工作的创建按钮。
  - Workspace：V0 只展示只读文件树 + 文件预览布局占位和空状态；不创建默认文件，不提供新建、编辑、保存、删除或 Agent 写入。
  - Member Profile 修改影响未来 AgentRun，并递增 `configVersion`；Room 只通过稳定 `memberId` 引用成员。
- 智能体 Agent
  - 主 Agent：自定义系统提示词（当前完整系统提示词，保存后下轮主 Agent 对话生效）。
  - Explore 子代理：模型下拉。
- 工具 Tools
  - 普通基础工具保持逐项开关；当前 provider 下不可用的工具显示禁用态与原因。
  - Browser Use 使用一个“浏览器”总入口，说明默认只向模型披露 gateway、需要时才加载完整工具包；分类执行工具与下载/上传/剪贴板等敏感能力放在默认折叠的“高级设置”中。
  - 浏览器总开关关闭时保留子项禁用偏好，并同时关闭 Browser prompt 与运行时工具注入；浏览器可用性文案明确依赖 Browser Bridge / Chrome 扩展，不归因于 LLM provider。
- 扩展 Host Extensions（管理 Browser Bridge 等需要本机程序或浏览器桥接的 Host 扩展；不加载后端 Cordis 插件的前端代码）
  - 「扩展源码」卡片：配置包含 Browser Bridge 源码的 `actspace-agent` 仓库路径，路径由 renderer localStorage 保存。
  - 「已接入的扩展」列表：当前提供 Browser Bridge 的编译安装、本机桥接注册、连接检查和高级诊断；Chrome 扩展仍需用户在 `chrome://extensions` 中手动加载或重新加载。
  - 后端 Cordis 插件由 Runtime 的 Profile / Bundle / Patch 装载，不在前端设置页安装、启用或执行。
- Skills（管理**知识能力**的可见性；后端插件和 Host 扩展不在此处管理）
  - Skill 卡片列表：name / description / scope+来源徽标 / SKILL.md 目录路径 / 异常 warning；同名被遮蔽（shadowed）的条目默认不展示、只在顶部计数提及。
  - 每卡提供「主 Agent」开关，默认全开，关闭写 `settings.skills.disabled`。
  - 顶部「安装 Skill」：选目录 → 校验 SKILL.md → 复制到 `<userData>/skills/<目录名>/`；仅该目录下（`removable`）的 Skill 显示「卸载」按钮（confirm 后删除目录）。
- 外观 Appearance（字体 + 缩放 + 三态主题均已落地）
  - **字体**（参考 Cursor，只分两类）：
    - `UI 字体`：驱动 `--act-font-ui`，连带 AI 输出正文（`.markdown-body` 用的 `--act-font-display` 始终 = `--act-font-ui`）。
    - `代码字体`：驱动 `--act-font-mono`，作用于代码块、diff、bash 输出、行内 code。
    - 选择方式为「预设字体栈下拉」（每项是带 fallback 的整套 font stack），不打包字体、不做自由输入。
  - **字号**（仿 Cursor，px 数字步进 + 重置按钮）：
    - `界面字号`：以 px 基准字号呈现（默认 14px，范围 12 至 20）。我们 UI 用写死像素而非 rem，无法逐元素改字号，故底层按 `uiFontSize / 14` 的比例做整窗缩放（`webFrame.setZoomFactor`），对外呈现为 px 数字而非百分比。
    - `代码字号`：CSS 变量 `--act-font-mono-size`，单独调代码/diff/bash 字号（默认 13px）。Electron 下整窗缩放会再乘一次，故写入前按缩放比反向补偿（`codeFontSize / zoom`），保证渲染恰为设定的 px。
  - **主题**：浅色 / 深色 / 跟随系统三态分段控件（`ThemeSegmented`）。由 `<html data-theme>` 驱动：`light`/`dark` 走 `:root[data-theme=...]` 覆盖；`system` 用 `:root[data-theme="system"]` 下的 `@media(prefers-color-scheme: dark)` 随 OS 切换。组件统一用语义类（`bg-surface`/`text-text-main`/`border-line`），主题只覆盖一组 `--act-color-*` 即整体翻转；数据可视化色走 `--act-chart-series-*`（浅深各一组）。原生交通灯 / 滚动条经 `appearance:set-theme` IPC → `nativeTheme.themeSource` 同步。
  - 外观偏好（字体、缩放、代码字号、主题）走 renderer `localStorage`，不进 `settings.json`；开机在 `main.tsx` 渲染前重放，避免闪烁。
- 归档会话 Archived Chats
  - 通过 `listSessions({ archived: true })` 读取已归档会话，不混入普通侧边栏列表。
  - 每条展示标题、更新时间、Agent Run 数和 workspace 摘要。
  - 「恢复」按钮调用 `archiveSession({ sessionId, archived: false })`，恢复后刷新归档列表，并通知应用刷新普通会话列表。
  - 恢复不会自动切换到该会话；它只重新出现在普通会话列表中。
  - 空状态显示「暂无归档会话」。
- 分析观测 Analysis
  - 放在「归档会话」与「更新」之间，作为真实设置分区；点击后保持左侧导航并在右侧展示未归档 Session 索引。
  - 当前活动 Session 只显示「当前」标记，不自动进入详情；用户选择具体 Session 后才切换到独立 Analysis 工作区。
  - 单会话详情采用 Agent Run / Turn 导航与 LLM Call 内容两栏，不增加常驻 Session 第三栏。
  - 从详情返回时恢复「分析观测」分区，以及此前的搜索、状态筛选、模型筛选、缓存列表与滚动位置。
  - 页面、交互与 Trace 可靠性事实来源为 `front-agent-analysis-observability.md`。
- 更新 Update
  - 作为设置导航里的独立页面，放在「归档会话」下方；不再塞进「通用」分区。
  - 选择本机 `actspace` 源码目录后，可触发“构建并更新”。
  - 该能力仅面向 macOS 已安装版；开发模式、非 macOS 或当前安装目录不可写时按钮禁用并显示原因。
  - 更新流程由 main 进程验证源码目录并写入 helper 脚本；构建阶段当前 app 保持打开，renderer 弹窗轮询 `status.json` 展示阶段进度；helper 默认生成 ad-hoc signed 本地包，并在退出当前 app 前验证新 `.app` 的 bundle 元数据、主可执行文件和 code signature。helper 报告 `ready_to_replace` 后，main 才退出当前 app，由 helper 替换 `.app` 并重启；复制或打开新 app 失败时 helper 会尝试恢复旧版本。
  - 页面分三段：源码目录、安装目标、构建并更新；安装目标展示当前进程路径与 Electron packaged 状态，方便排查安装版/开发态差异。点击“构建并更新”后弹出进度弹窗，显示启动 / 构建 / 准备替换 / 退出当前应用 / 替换等阶段和日志路径。

## 配置存储与安全

- 非敏感配置落 `<userData>/settings.json`（原子写）。
- 全局快捷键的组合键与打开目标落 `settings.shortcuts.quickOpen`；Electron main 先注册候选组合键，再持久化并注销旧组合键，避免冲突配置被保存成已生效状态。
- **供应商、搜索与图片 API Key 集中写入 main-only `<userData>/secrets.json` v2 明文文件**；创建、原子替换和启动读取时统一收紧为 `0600`。UI 与 IPC 永不回传明文，仅返回「是否已配置」或脱敏存储错误。读取、格式、权限或旧密文迁移失败时，服务商页显示错误并禁用新增，main 同时阻止所有凭据写入，避免空状态覆盖原文件。
- 本地更新源码目录落 `<userData>/local-update.json`，只保存路径；更新日志写 `<userData>/tmp/local-update/update.log`，阶段状态写同目录 `status.json`。`local-update:start` 只接受已保存且通过校验的源码目录，不接受 renderer 传入的任意命令或脚本内容。
- 配置生效：main 把 env-backed 设置覆盖到 `process.env` 后 `loadEnv()` 刷新冻结的 `env`，**下一轮对话自动生效，无需重启**；`settings.json` 只保存主 Agent 系统提示词文件路径，正文由 `settings:read-agent-system-prompt` / `settings:write-agent-system-prompt` 读写 `<userData>/prompts/main-agent.md`，真实 turn 和 `context:describe` 都从同一 prompt 文件注入。
- UI 偏好（主题、UI/代码字体、界面缩放、代码字号）走 renderer `localStorage`，不进 `settings.json`；开机渲染前重放。

## 视觉原则

- 保持极简、冷静、桌面应用感。
- 不使用弹窗式设置菜单（供应商 Key 输入这类轻量弹窗除外）。
- 不引入登录卡片、账号浮层或复杂账户中心。
- 让用户感受到这是同一产品的另一种主页面，而不是另一个系统。

## 当前参考图

下图仍作为「整页接管（两栏）」视觉基线；实际导航包含 Members、Tools、Host Extensions、Skills 等分区。Members 详情在右侧内容区内部使用 Profile / Activity / Reminders / Workspace 局部 Tab，不增加第三个常驻侧栏。

![设置页定稿图](settings-page-final.png)
