# 用 Go Command Engine 把浏览器插件变成薄执行后端

## 是什么

浏览器 Agent 很容易把所有逻辑都堆进 Chrome Extension：selector、点击、等待、下载、日志、权限和 session 状态都能在 JavaScript 里快速写出来。但长期维护更稳定的结构是把系统拆成三层：

```text
Agent 工具与用户审批
  -> Go Command Engine（语义、验证、编排、状态）
  -> Chrome Extension primitive（权限域内执行）
  -> CDP / Chrome APIs
```

页面内 DOM 语义再单独放到一份由 Go `go:embed` 管理的 injected runtime 中。这样 Go 不需要重新实现 DOM，也不需要引入完整 Playwright；Extension 则不需要承担产品级 command 语义。

## 为什么不是把 62 个工具直接给模型

叶子命令多不等于模型能力强。平铺 62 个工具会带来三个问题：

1. 工具描述占据大量稳定 prompt 前缀。
2. 相似工具之间选择成本高，例如 CUA click、DOM click、Locator click。
3. 权限、preview 和禁用配置需要维护 62 份表面契约。

更小的模型接口是 9 个分类工具，加 `help` 和 `run`。分类工具提供稳定 action enum 和常用字段；Go registry 对单 action 做最终严格校验。模型不确定参数时再渐进调用 `help`，需要确定性步骤时才用结构化 batch。

## 核心模式一：Registry 是机器事实来源

canonical registry 不应只是 command name 数组。每条记录至少同时包含：

- category/action 与稳定 ID；
- input/output schema；
- risk、readOnly、effect、origin policy；
- backend capability；
- preview kind、implementation status、handler key；
- legacy alias。

CLI help、Agent action enum、审批 metadata 和文档 parity 都从 registry 派生。否则“协议里有、Extension 里有、Agent 不知道”或“文档写已实现、handler 还是占位”会反复出现。

## 核心模式二：Injected runtime 提供 DOM 语义，不拥有浏览器生命周期

Go 擅长 session、timeout、错误模型和跨平台单二进制，但不适合重写浏览器 DOM API。小型 runtime 可以负责：

- strict CSS selector；
- visible/enabled/editable/checked；
- text/attribute/count/batch read；
- 原生 value setter 与 input/change 事件；
- DOM snapshot node_id 与 stale 检查。

Go 每次调用前检查 runtime version，导航后全局变量消失就自动重注入。参数必须先 JSON 编码，再进入表达式，不能用字符串拼接构造 selector 或文本值。

这个边界非常重要：runtime 不管理 tab、attach、权限、下载或 Agent approval，也不提供任意模型 JavaScript escape hatch。

### CSS 可见不等于视口可操作

Locator 的 `is_visible` 通常回答“元素是否有可见样式和非零布局盒”，元素在当前视口之外仍可以是 visible；但 DOM CUA snapshot 的消费者会直接使用 bounding box 做坐标操作，必须额外要求元素与 viewport 相交。

因此不要全局修改同一个 `isVisible`：

- Locator 查询继续使用 CSS/layout visibility，保持 API 语义稳定。
- DOM CUA snapshot 使用 `isVisible && isInViewport`，排除负坐标或超出 viewport 的节点。
- 可交互候选还要包含 `[draggable=true]` 等不一定带 button/role/tabindex 的原生交互元素。

把两种语义混在一起，要么会让 `locator.is_visible` 错误地把折叠区以下元素判为不可见，要么会给 CUA 返回无法点击的坐标。

## 核心模式三：Batch approval token 必须绑定确切动作

只给 `browser_run` 做一次通用批准会产生权限绕过。安全的做法是：

1. Go 展开所有 actions，逐项严格校验并计算最高风险。
2. 对规范化 action 数组计算 hash。
3. 签发绑定 `actionHash + sessionId + turnId + expiresAt` 的 HMAC token。
4. Agent Core 展示整批摘要并等待用户批准。
5. 执行时 Go 重新计算 hash 并验证 token。

mutation batch 强制顺序和首错停止；只有互不依赖的只读 batch 才能选择继续执行。这样模型不能在审批后替换 action、跨 turn 复用 token，或先执行低风险前半段再请求高风险批准。

## 核心模式四：跨请求浏览器事件需要“先 arm，再消费 token”

文件选择器和下载不是普通 request/response：事件可能发生在另一个 action 之后。若 `wait_for_file_chooser` 直接阻塞，顺序 batch 将无法继续执行触发 chooser 的 click。

可复用的解决方法是两阶段 token：

```text
arm file chooser -> chooser token
click -> CDP event binds token
set files(token) -> wait until bound, then DOM.setFileInputFiles
```

下载同理：先 arm download token，触发下载，再通过 token 等待完成路径。token 必须绑定 tab，并有 bounded timeout；否则多 tab 或并发下载会串线。

## 常见陷阱

- **Extension attach 不是幂等的**：同一个 tab 上多层逻辑重复 attach 会报错。使用引用计数，只有 0→1 真 attach，1→0 真 detach。
- **持久 debug attach 会被短操作误 detach**：Locator/CUA 的临时 attach 必须和 debug/file chooser 的长期 attach 共享引用计数。
- **Chrome primitive 仍要做 ownership 复核**：Go 校验不能代替 Extension 的最终 `owned/claimed tab` 边界。
- **旧 session preview 不能随工具退役一起删除**：新模型不再看到旧工具名，但历史记录仍需要渲染。
- **裁剪不等于隐私隔离**：DOM、截图、console 和 clipboard 即使被截短，仍可能包含凭据。真实结果应只进入当前模型调用，session、preview 和日志使用脱敏占位符。
- **代码完成不等于真实 Chrome 完成**：Native Messaging manifest、Extension reload、固定 ID、断线重连和真实 profile smoke 都必须单独记录。
- **DOM snapshot 的 visible 需要明确是哪一种可见**：CSS 可见用于 Locator，视口相交用于坐标驱动的 DOM CUA。
- **重放下载不能丢失元素语义**：从原 `<a download="name">` 创建临时 anchor 时必须继承 download filename，否则 event/path 链路虽成功，用户得到的文件名仍会退化为 URL basename。

## 核心模式五：把浏览器结果视为 ephemeral capability

普通工具通常把结果同时用于当前模型、session replay、UI preview 和运行日志；真实浏览器不能直接复用这个默认。页面输出的敏感性不是由 command name 决定的：一次 `inner_text`、console log 或 screenshot 都可能意外包含账号、cookie 派生 token 或私有内容。

更稳妥的边界是：

```text
真实 Browser result -> 当前 Agent loop / 当前 LLM call
                    -> persistence sanitizer -> status + safe summary + placeholder
```

输入侧也要同步处理：fill/type/clipboard 的 `text`、`value`、rich `items`，以及 `browser_run.actions[].params` 的嵌套 payload 都必须递归清洗。只清理 tool result 会让 assistant tool call、tool_start 或审批日志继续泄露原始输入。

这一模式的代价是恢复旧会话时模型看不到当时的页面原文，需要重新读取当前状态。对于用户真实 profile，这个可重取成本通常小于长期落盘敏感浏览器数据的风险。

## 核心模式六：单一 Extension 连接不等于单一 Agent session

Chrome 通常只维持一条 Native Messaging port，但 Native Host 的 Unix socket 可以同时服务多个 Agent session。如果 Extension 只保存一份全局 `ownedTabIds` / `claimedTabIds`，那么任何 session 的 `finalize keep=[]` 都可能关闭其他 session 的 handoff tab。

正确边界是把 session identity 传到最终权限执行层：

```text
Agent socket connection
  -> session.start(sessionId, turnId)
  -> Native Host 为每个 backend.* primitive 注入 sessionId
  -> Extension sessions[sessionId]
       - owned/claimed tabs
       - session tab group
       - session name
```

deliverable group 可以是跨 session 的用户成果分组，但“谁能 attach/CDP/close/finalize 哪个 tab”必须按 session 分桶。公共 CLI 没有显式 `session.start` 时，也应使用稳定、独立的 `cli` session，而不是回退到所有 Agent 共用的全局状态。

测试不能只证明单 session cleanup；至少要同时建立 A/B 两个 session，让 A 保留 handoff、B 执行 finalize，再确认 A 仍存在，最后分别清理。

## 自检问题

1. 某个新能力应该进入 Go handler、injected runtime，还是 Extension primitive？判断依据是什么？
2. 为什么 `browser_run` 的批准不能只绑定工具名和风险等级？
3. 文件选择器为什么适合 arm token，而不是一个直接阻塞的 wait command？
4. 为什么“输出已经截断”仍不足以证明 Browser session 和日志安全？
5. 为什么同一个 offscreen 元素对 Locator 可以是 visible，对 DOM CUA snapshot 却应该被排除？
6. 为什么 Native Messaging 只有一个 Extension port，仍然必须把 sessionId 注入每个 primitive？

关联 history：`docs/histories/2026-07/20260710-0130-browser-use-full-implementation.md`。
