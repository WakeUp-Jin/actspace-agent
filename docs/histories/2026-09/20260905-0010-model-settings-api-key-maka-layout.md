# 模型设置 API Key 路由布局重做

## 2026-09-06 加载骨架补齐

- 用户发现点击模型设置时仍显示卡片骨架。根因是正常列表重做后遗留的 ProviderCardsSkeleton 未同步，仍为两列 250px 卡片；loaded 又等待远程余额查询才结束。
- 改为三条 68px 单列连接行骨架，使用主题占位与减少动画偏好；本地连接数据读完后切换列表，余额刷新独立执行，避免部分行与骨架并存。
- 新增延迟本地设置和延迟余额两项回归，旧代码实跑两项均失败，修复后模型/设置页测试 54 项通过。类型检查、renderer 构建、主题和文档检查通过；浏览器 fixture 浅色、深色及 375px 内容宽度可见正确行式骨架。真实 Electron 实窗本次未验证，未提交。
- 此次为已有列表加载状态的局部补齐，不单独新增学习文档。

## 2026-09-06 九家供应商与三种自定义协议

用户确认最终目录为 Moonshot、DeepSeek、MiniMax、OpenAI、Anthropic、Z.AI、Xiaomi、火山方舟 Coding Plan、OpenRouter，以及 OpenAI Chat / OpenAI Responses / Anthropic 三种自定义服务，覆盖下文早期范围。

- 十二个入口使用同一个带 Logo 的平面列表，自定义可重复添加；移除其他预设但保留其已存连接。补齐 Anthropic、Xiaomi、火山方舟的 Maka 同源图形与来源说明。
- SettingsV4 连接持久化 protocol，旧连接无协议时保留 Chat。创建时安装手填模型，模型标识包含连接标识，不改任务默认模型；编辑模型 ID 不破坏旧模型引用。
- 模型可用性和实际请求读取绑定连接的 Key、地址和协议，不依赖 OpenRouter 默认 Key。修复独立连接 Key 无法重载、模型设置清洗丢失 connectionId、V4 模型元数据覆盖更新的问题。
- 自定义连接写入进入同一 mutation queue，避免并发新增丢连接；编辑失败恢复旧 Key。内置连接详情排除其他独立连接的模型。
- 回归覆盖目录顺序/筛选/Logo/重复添加/保存重试、三种协议到 wire route 的派发、重启、同模型不同连接、删除拒绝回落、禁用模型持久化、旧协议兼容、并发创建和失败回滚。

工程验证：相关 Desktop 79 项与 Shared 22 项测试通过；Shared 构建、Desktop typecheck、renderer 构建、Electron main/preload 构建及主题检查通过。Renderer 样例已检查浅色目录、Responses 表单、深色 375px 目录；窄屏内容宽度没有横向溢出。浏览器样例不保存凭据，不等于真实 IPC 验收。真实 Electron 开发身份仍无法由 Computer Use 识别，未进行真实 Key 请求。

学习记录：[连接标识与模型标识的作用域](../../learnings/2026-09/20260906-connection-scoped-model-identity.md)。

## 变更

- 按 Maka 的路由语法重做模型添加目录和 API Key setup 页面。
- 目录改为扁平分隔列表，整行点击，不再显示列表操作按钮。
- setup 使用行内返回箭头、Provider logo、单一 h3 路由标题、必填 API Key、普通高级设置行和主题主按钮。
- 本阶段限定为 DeepSeek、Kimi、OpenRouter 的 API Key 连接，OAuth/订阅暂不展示。
- 增加视觉结构回归测试，覆盖单一页面 h2、扁平目录、必填 Key 文案和主题主按钮。
- 增加显式 Provider logo registry；OpenRouter 使用 Maka 同源的官方品牌资源，未知映射使用中性占位而不复用其他品牌。
- 内嵌 API Key 配置路由不再声明为 modal dialog，Escape 返回由页面路由处理。

## 验证

- `pnpm --filter @actspace/desktop test -- src/renderer/test/provider-model-settings.test.tsx`
- `pnpm --filter @actspace/desktop typecheck`

两项均通过。Electron 真实窗口截图和多供应商 runtime 扩展仍是后续验收项。

## 后续执行

- 增加共享 ProviderDefinition registry，统一供应商目录、字段、能力和 logo 映射。
- 自定义 OpenAI 兼容连接支持创建、编辑、删除、API Key 主进程存储、base URL、默认模型和代理配置。
- 模型设置支持 connectionId 绑定，并在运行时按连接解析凭据和 endpoint；设置页提供自定义连接列表与详情路由。
- V4 命名空间补丁支持记录删除语义，避免删除连接后被合并逻辑重新保留。

验证：共享包构建、Desktop typecheck、Electron preload 构建、完整 Desktop 测试 82 文件/557 断言、`check:docs`、`check:frontend-theme` 和 `git diff --check` 均通过。Electron 打包窗口、真实供应商请求和手工截图验收仍需在对应环境完成；当前 CUA 因 macOS 锁屏无法启动真实窗口。

## 首批供应商范围收口

- 根据 Maka 目录参考图和用户确认，首批只保留 API Key 连接：DeepSeek、Kimi、OpenRouter、OpenAI、xAI/Grok、Mistral、Qwen、MiniMax、Z.AI、Groq。
- OAuth、订阅和 Claude Code / Codex / Copilot 等暂不进入添加连接目录，避免展示当前运行时尚未实现的登录入口。
- 兼容供应商通过独立 catalogId、logoKey、默认 Base URL 和默认模型进入自定义 OpenAI-compatible 连接；因此可同时保存多个中转连接，且不会把不同品牌错误地映射成 OpenRouter 图标。
- 供应商目录、显式 logo 映射和连接路由回归测试已更新。新增验证：Shared model-config 9/9，Provider settings 21/21，Settings page 25/25，Electron preload 构建通过。

## 2026-09-06 添加连接增量验收

- 使用 Maka 原始品牌 SVG 路径和资源补齐首批 API Key 目录；MiniMax 使用 Simple Icons SVG。资源和许可证记录在 provider-marks/README.md。单色标识随主题翻转，自定义连接按 catalogId 映射品牌。
- Key 表单统一输入框、显示/隐藏、单一行内路由标题与紧凑操作区，移除遗留 Dialog 包装。目录搜索固定桌面宽度，取消返回保留筛选，空结果可清除筛选。
- 修复已有连接更换 Key 未提交、自定义连接编辑未打开、仅有自定义连接时误显示空态。保存失败保留草稿。
- 高级连接设置只展示现有地址、代理和 Management Key 能力；移除没有真实编辑链路的 Header/JSON 操作。
- 新增三条交互回归，覆盖兼容连接取消/筛选/显隐、换 Key 失败重试、自定义连接编辑/保留 Key/品牌映射；相关两个文件共 48/48 测试通过。
- Shared build、Desktop typecheck、Renderer production build、Electron main/preload build 通过；Renderer 仍有大于 500 kB 的 bundle 提示。
- 显式开发夹具：`apps/desktop/src/renderer/test/fixtures/model-settings-preview.html`，复用真实 ProviderSettings 与样式，所有保存均为失败样例，不读取或写入用户凭据。
- 已通过 CUA 查看 1024px 浅/深目录、浅色 Kimi Key 表单、375px 深色 OpenAI 兼容表单；箭头与标题同行、Logo 可见、输入及按钮无横向裁切。截图见本轮工具记录，未把 mock 当成 IPC 验收。
- 原生验收：按 dev-runtime 日志的 appId 和 appPath 定位开发版应用，CUA 返回 Invalid app，未观察到真实 Electron 窗口。真实供应商请求、凭据保存与新连接焦点恢复仍需最终验收。
- 主题检查与 diff 空白检查通过；全仓文档检查被另一任务 `20260906-agent-tool-experience` 的已完成 active 计划阻断，未修改其文件。
- 本次命中“可迁移”和“有陷阱”，补充学习速记：`docs/learnings/2026-09/20260906-provider-brand-vs-transport.md`。
