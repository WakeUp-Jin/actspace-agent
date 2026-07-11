# Plan 5 真实 Chrome 验收记录

状态：全部通过

日期：2026-07-10

## 环境准备

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 新 `abb` 构建 | 通过 | `plugins/browser-bridge/build.sh` |
| Native Host manifest | 通过 | allowlist 指向固定 Extension ID `eneeikpgpieikinaimmgmdiafbgbanei` |
| Native Host 原子升级 | 通过 | URL wait 修复版构建产物与安装二进制 SHA-256 均为 `a242c58b1a76576e4293c46143f2df38030b33d7231d98ae2eba722cb2d584f0`，并通过同目录临时文件 + rename 替换 |
| Extension reload | 通过 | 多轮 reload 后 `info.version=0.2.1`，runtime v3、CLI compatibility 和 session-scoped primitives 均进入真实运行路径 |
| Local RPC socket | 通过 | 沙盒外 `doctor`、`ping`、`info` 均成功；全部 capability 为 `true` |

## 自动化前置门禁

- Go protocol/CLI/registry/backend/locator tests：通过；AST coverage test 证明 registry 中每个 handler key 都有 dispatcher case。
- Registry：62 条、9 类、62/62 `implemented`、全部 `go.*` handler；生成的 Agent action metadata 与命令面文档 parity 通过。
- Extension `background.js` syntax 与 primitive contract：通过；contract 覆盖 session ownership、多 claimed tab 状态、claim 自动分组、session 命名、deliverable/handoff finalize、未 claim close 拒绝、legacy 高层 handler 不可用、manifest 资源边界和 runtime/manifest version 对齐。
- Locator JS fixture：通过（strict、fill events、select、checked、stale node、wait、viewport-only DOM snapshot、draggable、download filename、media、clipboard text/rich clipboard）。
- Go session/event lifecycle：通过；attach 引用计数、断线 drain、event state reset、file chooser/download token 清理和 backend capability preflight 均有单测。
- Agent Core：11 个工具、Socket 长连接、image content、single/batch approval、capability hard deny、敏感参数与结果持久化隔离测试通过。
- Desktop：Browser Bridge 原子安装、状态 single-flight/backoff、Agent runtime context 与设置能力目录测试通过。
- CI：workspace workflow 已加入固定 SHA 的 `setup-go`、`pnpm check:browser` 和 Browser Bridge Go tests；Action pinning 检查通过。

## 手工重载后执行矩阵

每一项记录 `command/category / backend / tab-origin / approval / expected / actual / cleanup / evidence`。

| 分类 | Smoke case | 预期 | 当前 |
| --- | --- | --- | --- |
| tabs | list → create → selected → name_session | 只返回 session tabs，新 tab 进入 Agent group | 通过；公共 CLI 与 Agent category tool 均验证 |
| navigation | goto → reload → back → forward | HTTP(S) 导航完成并等待 load | 四项通过；根 URL 尾 `/` 规范化已修复并真实回归 |
| locator | snapshot/read → fill → select → set_checked → screenshot | strict CSS subset、原生事件、截图正常 | 通过；fixture 表单状态与截图验证 |
| DOM CUA | snapshot → node click/scroll → stale node after navigation | node_id 可用且导航后明确 stale | 通过；viewport-only nodes、click 与 scroll 验证 |
| CUA | screenshot → move/click/double/scroll/type/key/drag | CSS 坐标与 DPR 对齐，导航点击会等待 | 通过；cursor overlay、click、drag、scroll 与 screenshot 验证 |
| wait | load/url/timeout | bounded wait 与 URL prefix match 正常 | load、100ms timeout、带/不带 `/` exact URL 均通过 |
| I/O | clipboard text roundtrip；下载 token/path | high-risk 审批明确，token 与 tab 绑定 | clipboard roundtrip + restore 通过；download token/path 通过但发现 filename 丢失，runtime v3 已修复，待 reload 后复测 |
| debug | enable logs → console probe → filter/limit | 最多 500 条，按 level/filter/limit 返回 | 通过；fixture console probe 被 filter 读取 |
| user/finalize | open_tabs → claim → finalize | 不猜 tab ID，不自动关闭未 owned 的用户 tab | 通过；claim/handoff、deliverable ownership release 和 A/B isolation 验证 |

## 2026-07-11 基础真实 Chrome 结果

- `doctor/ping/info`：Native Messaging connected，tabs/history/CDP/download/file chooser/clipboard/debugger capability 全部为 `true`。
- `tabs.create/list/selected/name_session/finalize`：通过，临时标签页均被清理。
- `locator.inner_text(h1)`：`Example Domain`；`locator.count(a)`：`1`。
- `dom.snapshot`：返回一个可交互 `Learn more` 节点，含 node id 与 bounding box。
- `cua.screenshot`：JPEG，CSS viewport `1920×899`。
- `navigation.goto/reload/back/forward`、`wait.load_state`、`wait.timeout`、带尾 `/` 的 `wait.url`：通过。
- `debug.logs`：成功启用 attach，空页面返回 bounded `[]`。
- `user.open_tabs/history`：通过；history 可读取本轮 example.com/example.org 访问记录。
- 发现：Chrome 将 `https://example.org` 规范化为 `https://example.org/`，旧 exact `wait.url` 未把两者视为等价。现已将 exact 比较收敛为仅规范化空根路径与 `/`，query 和普通 path 仍精确比较，wildcard prefix 语义不变；Go 全量测试和新 Native Host 真实回归均通过。无尾 `/` 的 example.org wait 与 back 后 example.com wait 都在 1ms 内完成。
- 本地 fixture canonical smoke 已真实通过 Locator form、DOM CUA click、坐标 CUA click、console event、file chooser、screenshot、scroll、navigation 和 cleanup。拖拽阶段发现 `visible_dom` 返回 offscreen 节点且不收录 draggable；runtime v3 已加入 viewport intersection 和 `[draggable=true]`，并在 smoke 中加入 cursor overlay 断言，待 reload 后复测。
- I/O smoke 已真实通过 clipboard text read/write/read/restore；download created/changed token 与 `download_path` 返回正常。旧 runtime 丢失原 anchor 的 download filename，实际保存为 `sample.txt`；runtime v3 已继承 `download` 属性，待 reload 后确认保存为 `browser-bridge-sample.txt`。
- 首次 reload 已确认 Extension `info.version=0.2.1` 与新增 claimed-tab state 生效；随后的 Locator smoke 发现 Go `RuntimeVersion=1` 与 embedded runtime `VERSION=3` 漂移。已修复并加入机械 parity test，后续完整 fixture 证明 runtime v3 握手进入真实路径。
- 修正版 reload 后，完整 fixture 18 项通过，包含 Locator、DOM CUA、坐标 CUA、cursor、drag、debug、file chooser、screenshot、scroll、navigation 和 cleanup；I/O smoke 确认下载名为 `browser-bridge-sample.txt`，clipboard roundtrip 后恢复原文本。claim 后发现并修复 canonical `keep[].tab_id` 到 backend `tabId` 的 nested casing 漏洞，handoff 复测通过。
- 分发 CLI 审计发现 `abb user-tabs` 等旧公共命令被默认关闭的 legacy forwarding 一并拦截。现已增加 CLI method → canonical command compatibility adapter，旧输出形状保持不变，同时旧 click/fill wire handler 仍默认禁用；待 reload 后用真实 socket 复测 `user-tabs`、claim/finalize。
- 公共 CLI、claim/handoff 和 Agent approval/denial 均通过后，跨 session cleanup 发现 Extension 仍用全局 owned/claimed set：后续 session 的 finalize 会关闭先前 handoff。现已让 Native Host 为 primitive 注入 sessionId，Extension ownership/group 按 session 分桶；A/B 真实 smoke 证明 B cleanup 不影响 A handoff，最终两边分别清理成功。

## 最终真实验收证据

- `smoke.cjs`：18 项通过，覆盖 Locator、DOM CUA、坐标 CUA、cursor、drag、file chooser、debug、screenshot、scroll、navigation 和 cleanup。
- `io-smoke.cjs`：下载路径为 `~/Downloads/browser-bridge-sample.txt`；clipboard text roundtrip 后恢复原文本。
- `claim-smoke.cjs`：用户 tab 精确 claim、session naming、title read、handoff finalize 和保留通过。
- `deliverable-smoke.cjs`：deliverable tab 保留、退出 session ownership，通过 Extension contract 确认进入 `✅ actspace` group。
- `agent-approval-smoke.cjs`：真实 ToolManager approval 生效；拒绝含 clipboard write 的 high-risk batch 后页面和剪贴板无部分执行；摘要包含 `http://127.0.0.1:4173` origin 且不包含输入 payload。
- `session-isolation-smoke.cjs`：Session A handoff 在 Session B cleanup 后仍存在，B 只清理自身，最终 A/B 均完成 cleanup。
- 公共 CLI：`abb user-tabs`、`tabs`、`history` 已通过 canonical compatibility adapter；旧 Extension high-level click/fill wire methods 仍默认禁用。

## 安全负例

- [x] mutation 被拒绝后不得向 Extension 发送 action。
- [x] high-risk `browser_run` 拒绝后不得执行前半批。
- [x] 设置中禁用 download/file-upload/clipboard-write capability 后，分类工具保持可见，但对应 effect 单 action hard deny、batch 整批拒绝。
- [x] 篡改 session/turn/action hash 或使用过期 approval token 必须失败。
- [x] 未 owned/claimed tab 的 primitive attach/CDP/close/cursor 必须返回 `tab_not_in_session`。
- [x] Browser 参数和结果在 preview、session、console/run log 中统一脱敏；当前 LLM 调用仍可使用真实页面结果，持久化只保留动作摘要和占位符。
- [x] 在真实 Chrome 中确认用户拒绝 origin/mutation/high-risk batch 后没有页面状态变化或部分执行。

## ActSpace Agent 手工验收输入

本地 fixture server：

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory plugins/browser-bridge/test-fixtures/acceptance
```

以下内容逐条作为新的 Agent 输入发送。每条都要求 Agent 报告实际调用的 Browser 工具、category/action、tab id 和最终读取结果，不允许用 Bash、curl 或通用网页工具替代。

### 1. 工具面和 registry

输入：

```text
只使用 Browser Use 工具检查当前工具面：先调用 browser_help 查询 locator.fill，再列出全部 Browser category 和命令总数。不要打开或修改网页。
```

期望：

- 模型只看到 9 个分类工具加 `browser_help`、`browser_run`，不是 62 个平铺工具。
- `locator.fill` 返回 canonical command `playwright_locator_fill`、参数 schema、risk、preview 和 `implemented` 状态。
- 总数为 62、分类数为 9；全程不出现 mutation 审批。

### 2. Locator 正向交互

输入：

```text
只使用 Browser Use 工具打开 http://127.0.0.1:4173/index.html。批准后，用 Locator 把 Name 填为 ActSpace、Notes 填为 Plan 5、Color 选择 green、勾选 Accept fixture terms，并点击 Apply form state。最后读取 #result-output，逐项报告 JSON；不要关闭标签页。
```

期望：

- 打开标签页和页面 mutation 会显示 origin、selector、输入摘要等审批 preview。
- `#result-output` 至少包含 `name=ActSpace`、`notes=Plan 5`、`color=green`、`agreed=true`、`applied=1`。
- Agent 使用 `browser_tabs` / `browser_locator`，而不是 raw CDP 或任意 JS evaluate。

### 3. DOM CUA、坐标 CUA、cursor 和调试事件

输入：

```text
继续使用当前 fixture 标签页。先用 DOM CUA snapshot 找到 Click count 按钮并点击一次；再截图，根据截图或新的 DOM snapshot 用坐标 CUA 再点击一次。然后启用 debug logs，点击 Emit console probe，读取包含 browser-bridge-fixture 的日志。最后报告计数、截图尺寸、console 文本和日志内容；不要关闭标签页。
```

期望：

- DOM CUA 返回的节点都与当前视口相交，node id 可用于点击。
- 按钮最终为 `Click count: 2`；CUA 操作时页面可看到 cursor。
- console 文本和 debug log 都包含 `[browser-bridge-fixture] console probe 1`。
- 截图通过 image content 返回，不把 base64 展开到普通文本或持久化日志。

### 4. 文件、下载和剪贴板正向审批

输入：

```text
继续使用当前 fixture 标签页，并只使用 Browser Use 工具完成三项高风险操作，每项都先展示审批并等我确认：
1. 捕获文件选择器，把 /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent/plugins/browser-bridge/test-fixtures/acceptance/sample.txt 选择到 #file-input，再读取 #file-output。
2. 捕获下载并点击 #download-link，再报告 download_path 返回的文件名和 URL。
3. 把纯文本 ABB_PLAN5_CLIPBOARD_20260711 写入剪贴板，再读回并精确比较。
不要读取或上传其他文件，不要写入其他剪贴板格式，完成后不要关闭标签页。
```

期望：

- file upload、download、clipboard write 分别明确显示 high-risk/effect preview，未经批准不执行。
- 文件输出为 `sample.txt`。
- 下载文件名为 `browser-bridge-sample.txt`，URL 指向本地 fixture 的 `sample.txt`。
- 剪贴板读回与固定文本完全一致。

### 5. 拒绝后无部分执行

先刷新 fixture，使 `#result-output` 回到 `{"state":"empty"}`，然后发送：

```text
在当前 fixture 标签页调用一次 browser_run，整批包含：把 #name-input 填为 SHOULD_NOT_APPEAR、点击 Apply form state、把 SHOULD_NOT_REACH_CLIPBOARD 写入系统剪贴板。必须整批 preflight，只请求一次批准，不允许拆成单工具执行。
```

在审批界面选择拒绝。

期望：

- preview 同时列出页面 mutation 和 clipboard write，整批风险为 high。
- 拒绝后不向 Extension 执行任何一条 action。
- `#name-input` 仍为空，`#result-output` 仍为 `{"state":"empty"}`，剪贴板不变。

### 6. claim、handoff 与 cleanup

手工在 Chrome 新开 `http://127.0.0.1:4173/page-two.html`，然后发送：

```text
只使用 Browser Use 工具列出用户 Chrome 标签页，找到 URL 精确为 http://127.0.0.1:4173/page-two.html 的标签页并 claim。把 Browser session 命名为 Plan 5 Acceptance，读取 #page-two-title，最后 finalize：把这个 claimed tab 保留为 handoff，其余本 session 创建的测试标签页关闭。不要关闭任何未 claim 的用户标签页。
```

期望：

- Agent 先 `user.open_tabs`，不猜 tab id；claim 后才允许读取/操作。
- title 为 `Acceptance Page Two`。
- finalize 后 handoff tab 保留，session 自建的非 keep tab 被关闭，未 claim 用户 tab 不受影响。

## 恢复入口

用户重载扩展后先执行：

```bash
plugins/browser-bridge/skill/scripts/abb doctor --json
plugins/browser-bridge/skill/scripts/abb ping --json
plugins/browser-bridge/skill/scripts/abb info --json
```

socket 恢复后继续本文件矩阵，不重新执行已通过的代码层门禁。
