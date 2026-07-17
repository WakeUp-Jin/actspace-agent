# Browser Use 命令面分类详解

## 当前状态

本文档完整记录 Browser Use 62 条 canonical command 的分类、参数契约和设计意图。来源为 Codex `browser-client.mjs` 逆向分析（open-browser-use 项目的可读重写）和 Chrome Extension 1.1.4 快照。

这 62 条已经全部进入 Go registry 并标记为 `implemented`，但不等于向模型平铺 62 个 tools。模型通过 9 个分类工具、`browser_help` 和 `browser_run` 使用它们。当前架构入口见 `agent-browser-use-index.md`；真实 Chrome 验收状态见 Plan 5。

命令 ID 中的 `playwright_*` 是兼容命名；本项目不引入 Playwright 运行时，而是在 Browser Bridge 内维护 ActSpace 自研 Locator Runtime。模型可见分类名统一使用 `browser_locator`。

2026-07-17 起，所有需要元素目标的 Locator command 接受二选一输入：

```text
selector: string  // 旧 CSS 兼容入口

target: {
  kind: css | role | text | label | placeholder | test_id,
  value?: string,
  role?: string,
  name?: string,
  exact?: boolean,
  frame_path?: target[]
}
```

`target` 是当前事实契约；逐条命令下方仍出现的 `selector` 示例属于兼容示例，不代表只支持 CSS。

## 三层操作模式

Browser Use 提供三种页面交互粒度。模型根据场景选择最合适的层级：

```
层级 3：Locator 选择器（canonical ID 保留 playwright_*）
  输入：优先结构化 role/name、label、placeholder、text、test-id；兼容 CSS
  特点：不需要截图；系统完成语义定位、等待、actionability、滚动和坐标计算
  适合：结构明确的页面，尤其是文本模型可从 DOM/ARIA 语义识别的控件

层级 2：DOM CUA (node_id)
  输入：由 dom_cua_get_visible_dom 返回的 node_id
  特点：不需要截图但需要先获取 DOM 快照；比坐标更稳定
  适合：页面结构中等复杂，用快照比截图更高效

层级 1：CUA 坐标
  输入：屏幕坐标 (x, y)
  特点：必须先截图，模型通过视觉理解决定坐标
  适合：视觉密集页面、Canvas、无法用选择器描述的元素
```

三层共享同一套 CDP 执行路径：最终都转换为 CDP `Input.*` 事件。

## 第一类：CUA 坐标命令

最底层的页面交互。模型需要看截图后输出坐标。

### cua_get_visible_screenshot

截取当前视口的可视截图。

```
参数：{ tab_id: int }
返回：{ data: string }  // base64 JPEG

内部实现：
  1. Page.getLayoutMetrics → 获取 viewport 尺寸
  2. 计算 devicePixelRatio 缩放比
  3. Page.captureScreenshot → 截图
```

### cua_click

在指定坐标单击。

```
参数：{ tab_id: int, x: number, y: number, button?: 1|2|3, keys?: string[] }
返回：{}

内部实现：
  1. await ui.moveMouse(tabId, x, y) → 从上次位置连续移动并等待到达
  2. 开始监听 Page 导航事件
  3. Input.dispatchMouseEvent(mousePressed)
  4. Input.dispatchMouseEvent(mouseReleased)
  5. 等待导航事件完成（如果触发了跳转）
```

### cua_double_click

双击指定坐标。

```
参数：{ tab_id: int, x: number, y: number, keys?: string[] }
返回：{}

内部：clickCount=2 的 click 流程
```

### cua_move

移动鼠标到坐标（不点击）。

```
参数：{ tab_id: int, x: number, y: number, keys?: string[] }
返回：{}

内部：
  1. await ui.moveMouse → 光标动画完成
  2. Input.dispatchMouseEvent(mouseMoved)
```

### cua_scroll

在指定坐标处滚动。

```
参数：{ tab_id: int, x: number, y: number, scroll_x: number, scroll_y: number, keys?: string[] }
返回：{}

内部：
  1. 移动鼠标到坐标
  2. Input.synthesizeScrollGesture
```

### cua_type

输入文本（不需要坐标，输入到当前焦点元素）。

```
参数：{ tab_id: int, text: string }
返回：{}

内部：Input.insertText({ text })
```

### cua_keypress

按键或组合键。

```
参数：{ tab_id: int, keys: string[] }
返回：{}

示例：
  keys: ["Enter"]
  keys: ["Ctrl", "a"]
  keys: ["Ctrl", "c"]

内部：
  按下所有修饰键 → 按下主键 → 释放主键 → 释放修饰键
  自动处理跨平台：ControlOrMeta → Mac 上为 Meta，其他为 Control
```

### cua_drag

沿路径拖拽。

```
参数：{ tab_id: int, path: [{x, y}...], keys?: string[] }
返回：{}

内部：
  1. 移动到起点
  2. mousePressed
  3. 依次 mouseMoved 到每个路径点
  4. mouseReleased 在终点
```

### cua_download_media

下载坐标处的媒体资源。

```
参数：{ tab_id: int, x: number, y: number }
返回：{}

内部：
  1. document.elementFromPoint(x, y)
  2. 找到最近的 img/video/source/a[href]
  3. 创建隐藏 <a download> 触发下载
```

## 第二类：DOM CUA 命令

基于结构化 DOM 快照的交互。模型先获取可见节点列表，再按 node_id 操作。

### dom_cua_get_visible_dom

获取当前页面可见的交互元素快照。

```
参数：{ tab_id: int, limit?: int }  // 默认 500，硬上限 1000
返回：{
  generation: int,
  total: int,
  returned: int,
  truncated: bool,
  nodes: [{
    node_id: string,
    tagName: string,
    role?: string,
    text: string,       // innerText/value/alt/title/aria-label，截断500字
    textTruncated?: bool,
    originalTextChars?: int,
    ariaName?: string,
    href?: string,
    type?: string,      // input type
    boundingBox: { x, y, width, height }
  }]
}

选择范围：a, button, input, textarea, select, summary, details, label,
         img, video, audio, [role], [onclick], [contenteditable=true], [tabindex]
过滤：可见（rect > 0, visibility !== hidden, display !== none）
节点上限：默认 500，调用方可调，硬上限 1000。
模型输出：使用紧凑逐节点行格式，50,000 字符内逐字保留且不进入通用 flash 摘要；
超过后只在完整节点边界停止，并返回 DOM_SNAPSHOT_TRUNCATED 与节点计数。
```

### dom_cua_click

点击指定 node_id 的元素。

```
参数：{ tab_id: int, node_id: string }
返回：{}

内部：
  1. 找到 node_id 对应的 DOM 元素
  2. scrollIntoView({ block: "center" })
  3. getBoundingClientRect → 中心坐标
  4. CUA clickPoint 流程
```

### dom_cua_double_click

双击。参数和 dom_cua_click 相同。

### dom_cua_scroll

在节点内或视口中滚动。

```
参数：{ tab_id: int, node_id?: string, scroll_x: number, scroll_y: number }
返回：{}

node_id 存在时：element.scrollBy(scroll_x, scroll_y)
node_id 不存在时：在视口中心执行 CUA scroll
```

### dom_cua_type

输入文本。

```
参数：{ tab_id: int, text: string }
返回：{}

内部：Input.insertText({ text })
```

### dom_cua_keypress

按键。参数和 cua_keypress 相同。

### dom_cua_download_media

下载 node_id 处的媒体。

```
参数：{ tab_id: int, node_id: string }
返回：{}
```

## 第三类：Playwright 选择器命令

最高层交互。模型只需给出选择器字符串，系统自动完成所有中间步骤。

### 选择器引擎说明

Playwright 选择器引擎被注入页面为 `window.__codexPlaywrightInjected`。支持：

- CSS 选择器：`button.submit`、`#login-form input[type=email]`
- 组合选择器：任何有效 CSS

定位流程：
1. `querySelectorAll(selector, document)` 找到所有匹配
2. 如果 1 个 → 直接使用
3. 如果多个 → 过滤出可见的，如果只有 1 个可见 → 使用
4. 否则 → strict mode violation 错误

### playwright_locator_click

点击选择器匹配的元素。

```
参数：{ tab_id: int, selector: string, button?: string, modifiers?: string[], force?: bool, timeout_ms?: int }
返回：{}

内部（自动完成全部）：
  1. 等待元素出现（带超时重试）
  2. 检查 visible 状态
  3. 检查 enabled 状态
  4. scrollIntoView({ block: "center", inline: "nearest" })
  5. getBoundingClientRect → 中心坐标
  6. CUA clickPoint（含导航等待）
```

### playwright_locator_dblclick

双击选择器匹配的元素。参数同 click。

### playwright_scroll

在页面视口或选择器匹配的滚动容器内滚动。

```
参数：{ tab_id: int, direction: "up"|"down"|"left"|"right", amount?: number, selector?: string }
返回：{}

内部：
  - selector 存在时，strict 定位元素并在其滚动容器内执行
  - selector 不存在时，在当前视口中心执行 CUA scroll
  - amount 使用 CSS 像素，默认 500
```

### playwright_locator_fill

填充输入框。

```
参数：{ tab_id: int, selector: string, value: string, replace?: bool, timeout_ms?: int }
返回：{}

replace=true（默认）：
  1. 定位元素
  2. element.focus()
  3. element.value = value
  4. 触发 input + change 事件

replace=false：
  1. 定位元素
  2. element.focus() + element.select()
  3. Input.insertText({ text: value }) → 追加到现有值后
```

### playwright_locator_press

在定位元素上按键。

```
参数：{ tab_id: int, selector: string, value: string, timeout_ms?: int }
返回：{}

示例：value = "Enter"、"Tab"、"Escape"

内部：focus 元素 → dispatchKeyChord
```

### playwright_locator_select_option

选择下拉框选项。

```
参数：{ tab_id: int, selector: string, selections: [{ value?, label?, valueOrLabel? }], timeout_ms?: int }
返回：{}

内部：injected.selectOptions(element, selections) → 触发 input + change
```

### playwright_locator_set_checked

勾选/取消复选框。

```
参数：{ tab_id: int, selector: string, checked: bool, timeout_ms?: int }
返回：{}

内部：
  1. 读当前 checked 状态
  2. 如果已经是目标状态 → 直接返回
  3. 否则 click 元素
  4. 验证状态确实改变
  5. radio 不允许 uncheck
```

### playwright_locator_inner_text

读取元素 innerText。

```
参数：{ tab_id: int, selector: string, timeout_ms?: int }
返回：{ value: string }
```

### playwright_locator_text_content

读取元素 textContent（含隐藏文本）。

```
参数：{ tab_id: int, selector: string, timeout_ms?: int }
返回：{ value: string }
```

### playwright_locator_all_text_contents

分页读取匹配元素的 textContent。

```
参数：{ tab_id: int, selector: string, offset?: int, limit?: int, timeout_ms?: int }
返回：{
  values: string[],
  total: int,
  offset: int,
  returned: int,
  has_more: bool
}
```

`offset` 默认 0；`limit` 默认 200、硬上限 1000。模型输出按完整 item 保留，避免大列表被通用摘要静默删除中间结果。

### playwright_locator_read_all

分页读取匹配元素的属性和文本。

```
参数：{ tab_id: int, selector: string, relative_selector?: string, offset?: int, limit?: int, timeout_ms?: int }
返回：{
  values: [{ attributes: {}, inner_text: string, text_content: string }],
  total: int,
  offset: int,
  returned: int,
  has_more: bool
}
```

### playwright_locator_get_attribute

读取元素属性。

```
参数：{ tab_id: int, selector: string, name: string, timeout_ms?: int }
返回：{ value: string | null }
```

### playwright_locator_is_visible

检查元素是否可见。

```
参数：{ tab_id: int, selector: string, timeout_ms?: int }
返回：{ value: bool }
```

### playwright_locator_is_enabled

检查元素是否可用（非 disabled）。

```
参数：{ tab_id: int, selector: string, timeout_ms?: int }
返回：{ value: bool }
```

### playwright_locator_count

匹配元素个数。

```
参数：{ tab_id: int, selector: string }
返回：{ count: int }
```

### playwright_locator_wait_for

等待元素到达指定状态。

```
参数：{ tab_id: int, selector: string, state: "attached"|"detached"|"visible"|"hidden", timeout_ms?: int }
返回：{}

用途：等待 loading spinner 消失、等待新元素出现等
```

### playwright_locator_download_media

下载选择器匹配的媒体资源。

```
参数：{ tab_id: int, selector: string, timeout_ms?: int }
返回：{}
```

### playwright_dom_snapshot

获取页面纯文本内容。

```
参数：{ tab_id: int }
返回：{ dom_snapshot: string }

内部：document.body?.innerText ?? ""
```

### playwright_element_info

获取坐标处的元素详细信息（用于辅助模型理解页面）。

```
参数：{ tab_id: int, x: number, y: number, include_non_interactable?: bool, timeout_ms?: int }
返回：[{
  tagName: string,
  role?: string,
  visibleText?: string,
  ariaName?: string,
  testId?: string,
  boundingBox?: { x, y, width, height },
  preview: string,
  selector: { primary: string, candidates: string[] }
}]

内部：document.elementsFromPoint(x, y) → 取前 10 个可见元素
```

### playwright_element_screenshot

截取坐标处元素的截图。

```
参数：{ tab_id: int, x: number, y: number }
返回：{ data: string }  // base64

内部：先 elementInfo 找到 boundingBox，再 Page.captureScreenshot with clip
```

### playwright_screenshot

截取整页或裁剪区域的截图。

```
参数：{ tab_id: int, cropX?: number, cropY?: number, cropWidth?: number, cropHeight?: number }
返回：{ data: string }
```

## 第四类：导航命令

### navigate_tab_url

导航到指定 URL。

```
参数：{ tab_id: int, url: string, timeout_ms?: int }
返回：{}

内部：
  1. 开始监听导航事件
  2. Page.navigate({ url })
  3. 等待 Page.loadEventFired 或 Page.domContentEventFired
  4. 如果收到 Page.navigationBlocked → 抛出安全错误
```

### navigate_tab_back

后退。

```
参数：{ tab_id: int }
返回：{}

内部：Page.getNavigationHistory → Page.navigateToHistoryEntry(current - 1)
```

### navigate_tab_forward

前进。

```
参数：{ tab_id: int }
返回：{}
```

### navigate_tab_reload

刷新。

```
参数：{ tab_id: int, timeout_ms?: int }
返回：{}

内部：Page.reload → 等待 load event
```

## 第五类：Tab 管理命令

### create_tab

创建新标签页。

```
参数：{}
返回：{ id: string }

内部：chrome.tabs.create → 加入 session tab group → 返回 tabId
```

### close_tab

关闭标签页。

```
参数：{ tab_id: int }
返回：{}

内部：detach debugger → Page.close
```

### list_tabs

列出当前 session 的标签页。

```
参数：{}
返回：{ tabs: [{ id, title, url, active }] }
```

### selected_tab

获取当前活跃标签页。

```
参数：{}
返回：{ id: string }
```

### name_session

命名当前浏览器 session（显示为 tab group 标题）。

```
参数：{ name: string }
返回：{}

示例：name = "Product Research - OBU"
效果：Chrome tab group 标题变为该名称
```

### finalize_tabs

清理 session 标签页。这是每个浏览器 turn 结束前的必要操作。

```
参数：{ keep: [{ tab_id: int, status: "deliverable"|"handoff" }] }
返回：{}

行为：
  - keep 列表中的 tab 保留
  - status = "deliverable" → 移入 "✅" 分组（用户的成果）
  - status = "handoff" → 留在 session 分组（待继续）
  - 不在 keep 中的 session tab → 关闭
```

## 第六类：用户浏览器表面命令

这些命令访问用户真实 Chrome 的信息，仅 extension backend 支持。

### browser_user_open_tabs

列出用户的所有打开标签页（不只是 session 内的）。

```
参数：{}
返回：{ tabs: [{ id, title, url, active, ... }] }

用途：让 Agent 了解用户当前在做什么，找到可以 claim 的相关 tab
```

### browser_user_claim_tab

将用户现有标签页纳入 session 控制。

```
参数：{ tab_id: int }
返回：tab 信息

行为：
  1. 把用户的 tab 移入 session tab group
  2. 后续可以对这个 tab 执行 CDP 操作
  3. finalize 时可以选择保留或关闭

用途：用户说"帮我处理这个页面"，Agent claim 用户当前正在看的 tab
```

### browser_user_history

搜索用户的浏览历史。

```
参数：{ query?: string, limit?: int, from?: string, to?: string }
返回：{ items: [{ url, title, lastVisitTime, visitCount }] }

用途：Agent 了解用户之前访问过什么、找到相关页面
```

## 第七类：等待/同步命令

### playwright_wait_for_load_state

等待页面加载完成。

```
参数：{ tab_id: int, state: "load"|"domcontentloaded", timeout_ms?: int }
返回：{}

注意：不支持 "networkidle"（Codex 明确拒绝）
```

### playwright_wait_for_url

等待页面 URL 变化到匹配条件。

```
参数：{ tab_id: int, url: string, timeout_ms?: int }
返回：{}
```

### playwright_wait_for_timeout

等待指定时间。

```
参数：{ tab_id: int, timeout_ms: int }
返回：{}
```

### playwright_wait_for_file_chooser

等待文件选择器弹出。

```
参数：{ tab_id: int, timeout_ms?: int }
返回：{ file_chooser_id: string, is_multiple: bool }

用途：配合文件上传流程
  1. 调用 wait_for_file_chooser（开始监听）
  2. 点击上传按钮（触发 chooser）
  3. 用 file_chooser_set_files 设置文件路径
```

### playwright_wait_for_download

等待下载开始。

```
参数：{ tab_id: int, timeout_ms?: int }
返回：{ download_id: string }
```

## 第八类：文件/下载/剪贴板命令

### playwright_file_chooser_set_files

设置文件选择器的文件。

```
参数：{ tab_id: int, file_chooser_id: string, files: string[] }
返回：{}

files 为本地绝对路径数组
内部：DOM.setFileInputFiles
```

### playwright_download_path

获取下载文件的本地路径。

```
参数：{ tab_id: int, download_id: string, timeout_ms?: int }
返回：{ path: string | null }

等待下载完成后返回路径。如果下载失败或取消，返回 null。
```

### tab_clipboard_read_text

读取剪贴板文本。

```
参数：{ tab_id: int }
返回：{ text: string }

内部：navigator.clipboard.readText()
```

### tab_clipboard_write_text

写入剪贴板文本。

```
参数：{ tab_id: int, text: string }
返回：{}

内部：navigator.clipboard.writeText(text)
```

### tab_clipboard_read

读取剪贴板（含图片等）。

```
参数：{ tab_id: int }
返回：{ items: [{ entries: [{ mime_type, text?, base64? }], presentation_style }] }
```

### tab_clipboard_write

写入剪贴板（含图片等）。

```
参数：{ tab_id: int, items: [{ entries: [{ mime_type, text?, base64? }] }] }
返回：{}
```

## 第九类：开发调试命令

### tab_dev_logs

获取页面 console 日志。

```
参数：{ tab_id: int, filter?: string, levels?: string[], limit?: int }
返回：{ logs: [{ level: "debug"|"info"|"warn"|"error"|"log", message: string, timestamp: string }] }

内部：
  - attach 时自动 Runtime.enable
  - 持续收集 Runtime.consoleAPICalled 和 Runtime.exceptionThrown 事件
  - 每个 tab 最多保留 500 条
  - filter 为子字符串匹配
```

## 安全门控

所有命令执行前经过三层检查：

### 1. Capability Check

根据后端声明的能力决定命令是否可用：

- `browserInfo.capabilities.downloads === false` → 禁止下载命令
- `browserInfo.capabilities.fileUploads === false` → 禁止文件选择器命令
- `browserInfo.type !== "extension"` → 禁止 claim_tab / finalize_tabs

### 2. Site Policy Check

检查目标站点是否被禁止：

- 调用远端 API 查询站点状态
- 缓存 TTL = 1440 分钟
- `feature_status.agent === true` → 站点被阻止
- localhost / 127.0.0.1 / ::1 免检

### 3. User Browser Session Permission

产品权限边界采用 Session 授权租约，不按 origin 重复询问：除 `browser_help` 外，第一次 Browser 工具调用请求一次允许/拒绝；允许覆盖当前应用运行期间的同一 Session，拒绝或超时只覆盖当前 Turn。站点 blocklist 与 capability hard deny 是独立的更低层安全边界，不能被 Session 授权绕过。

## 事件通知

后端主动推送的事件（非请求-响应）：

### onCDPEvent

CDP 协议事件转发：

```json
{
  "method": "onCDPEvent",
  "params": {
    "source": { "tabId": 42 },
    "method": "Page.loadEventFired",
    "params": { "timestamp": 1720000000.123 }
  }
}
```

常见 CDP 事件：
- `Page.frameStartedLoading` — 导航开始
- `Page.domContentEventFired` — DOM 就绪
- `Page.loadEventFired` — 页面完全加载
- `Page.navigationBlocked` — 安全策略阻止导航
- `Runtime.consoleAPICalled` — console.log 等
- `Runtime.exceptionThrown` — 未捕获异常

### onDownloadChange

下载状态变化：

```json
{
  "method": "onDownloadChange",
  "params": {
    "id": "download-uuid",
    "status": "in_progress",  // started | in_progress | complete | failed | canceled
    "filename": "/tmp/file.pdf",
    "bytesReceived": 102400
  }
}
```

## 命令统计

| 类别 | 数量 | 描述 |
|------|------|------|
| CUA 坐标 | 9 | 截图驱动的低层交互 |
| DOM CUA | 7 | node_id 驱动的结构化交互 |
| Locator 选择器 | 21 | 选择器驱动的高层交互，canonical ID 暂保留 `playwright_*` |
| 导航 | 4 | URL 导航和历史 |
| Tab 管理 | 6 | 创建/关闭/列表/命名/清理 |
| 用户浏览器 | 3 | 用户 tabs/history/claim |
| 等待/同步 | 5 | 加载/URL/超时/文件/下载 |
| 文件/下载/剪贴板 | 6 | 文件上传/下载/剪贴板 |
| 开发调试 | 1 | console 日志 |
| **合计** | **62** | |

## 维护规则

- 新增命令时先确定归属层级和类别。
- 命令名使用 snake_case，前缀标识层级归属。
- 参数中 `tab_id` 为必填（除少数全局命令外）。
- `timeout_ms` 可选，有合理默认值。
- 返回值始终为对象，不返回裸值。
- 命令数量、schema、风险、backend 和实现状态在 registry 落地后以 Go registry 为机器事实来源。
