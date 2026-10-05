# Browser Use 命令面分类详解

## 当前状态

本文档完整记录 Browser Use 62 条 canonical command 的分类、用途和关键行为边界。当前机器事实来源为 `browser-bridge/apps/cli/internal/commands/registry.go` 与 `schemas.go`；模型可以通过 `browser_help` 查询实际 schema。

这 62 条已经全部进入 Go registry 并标记为 `implemented`，但不等于向模型平铺 62 个 tools。模型通过 9 个分类工具、`browser_help` 和 `browser_run` 使用它们。当前架构入口见 `docs/design-docs/browser/agent-browser-use-index.md`；真实 Chrome 验收状态见 `docs/exec-plans/active/20260928-chrome-connect-experience.md`。

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

三层复用 CDP 与页面 Runtime：键鼠操作使用 `Input.*`，定位与 DOM 读写使用受控页面 Runtime，截图使用 `Page.captureScreenshot`。

## 参数与调用方式

完整输入/输出 schema、枚举值与可选字段只维护在 Go registry，不在本文复制第二份。使用前通过 `browser_help({ category, action })` 查询，人工诊断使用 `abb help <category> <action> --json`；两者都读取当前 registry。`category/action` 不是 canonical ID：例如 `playwright_locator_press` 对应 `browser_locator` 的 `press` action。

下列索引保留 62 条命令名称与用途。命令执行是否需要审批由只读标记、当前权限模式与整批 action 决定，不能从中文名称自行推断。

## 第一类：CUA 坐标命令

### cua_get_visible_screenshot

截取当前视口的可视截图。调用 `browser_cua`，`action: "screenshot"`。

### cua_click

在指定坐标单击。调用 `browser_cua`，`action: "click"`。

### cua_double_click

双击指定坐标。调用 `browser_cua`，`action: "double_click"`。

### cua_move

移动鼠标到坐标（不点击）。调用 `browser_cua`，`action: "move"`。

### cua_scroll

在指定坐标处滚动。调用 `browser_cua`，`action: "scroll"`。

### cua_type

输入文本（不需要坐标，输入到当前焦点元素）。调用 `browser_cua`，`action: "type"`。

### cua_keypress

按键或组合键。调用 `browser_cua`，`action: "keypress"`。

### cua_drag

沿路径拖拽。调用 `browser_cua`，`action: "drag"`。

### cua_download_media

下载坐标处的媒体资源。调用 `browser_cua`，`action: "download_media"`。

## 第二类：DOM CUA 命令

### dom_cua_get_visible_dom

获取当前页面可见的交互元素快照。调用 `browser_dom`，`action: "snapshot"`。

### dom_cua_click

点击指定 node_id 的元素。调用 `browser_dom`，`action: "click"`。

### dom_cua_double_click

双击。参数和 dom_cua_click 相同。调用 `browser_dom`，`action: "double_click"`。

### dom_cua_scroll

在节点内或视口中滚动。调用 `browser_dom`，`action: "scroll"`。

### dom_cua_type

输入文本。调用 `browser_dom`，`action: "type"`。

### dom_cua_keypress

按键。参数和 cua_keypress 相同。调用 `browser_dom`，`action: "keypress"`。

### dom_cua_download_media

下载 node_id 处的媒体。调用 `browser_dom`，`action: "download_media"`。

## 第三类：Locator 选择器命令

### playwright_locator_click

点击选择器匹配的元素。调用 `browser_locator`，`action: "click"`。

### playwright_locator_dblclick

双击选择器匹配的元素。参数同 click。调用 `browser_locator`，`action: "double_click"`。

### playwright_scroll

在页面视口或选择器匹配的滚动容器内滚动。调用 `browser_locator`，`action: "scroll"`。

### playwright_locator_fill

填充输入框。调用 `browser_locator`，`action: "fill"`。

### playwright_locator_press

在定位元素上按键。调用 `browser_locator`，`action: "press"`。

### playwright_locator_select_option

选择下拉框选项。调用 `browser_locator`，`action: "select_option"`。

### playwright_locator_set_checked

勾选/取消复选框。调用 `browser_locator`，`action: "set_checked"`。

### playwright_locator_inner_text

读取元素 innerText。调用 `browser_locator`，`action: "inner_text"`。

### playwright_locator_text_content

读取元素 textContent（含隐藏文本）。调用 `browser_locator`，`action: "text_content"`。

### playwright_locator_all_text_contents

分页读取匹配元素的 textContent。调用 `browser_locator`，`action: "all_text_contents"`。

### playwright_locator_read_all

分页读取匹配元素的属性和文本。调用 `browser_locator`，`action: "read_all"`。

### playwright_locator_get_attribute

读取元素属性。调用 `browser_locator`，`action: "get_attribute"`。

### playwright_locator_is_visible

检查元素是否可见。调用 `browser_locator`，`action: "is_visible"`。

### playwright_locator_is_enabled

检查元素是否可用（非 disabled）。调用 `browser_locator`，`action: "is_enabled"`。

### playwright_locator_count

匹配元素个数。调用 `browser_locator`，`action: "count"`。

### playwright_locator_wait_for

等待元素到达指定状态。调用 `browser_locator`，`action: "wait_for"`。

### playwright_locator_download_media

下载选择器匹配的媒体资源。调用 `browser_locator`，`action: "download_media"`。

### playwright_dom_snapshot

获取页面纯文本内容。调用 `browser_locator`，`action: "dom_snapshot"`。

### playwright_element_info

获取坐标处的元素详细信息（用于辅助模型理解页面）。调用 `browser_locator`，`action: "element_info"`。

### playwright_element_screenshot

截取坐标处元素的截图。调用 `browser_locator`，`action: "element_screenshot"`。

### playwright_screenshot

截取当前视口，或按裁剪区域截图。调用 `browser_locator`，`action: "screenshot"`。

## 第四类：导航命令

### navigate_tab_url

导航到指定 URL。调用 `browser_navigation`，`action: "goto"`。

### navigate_tab_back

后退。调用 `browser_navigation`，`action: "back"`。

### navigate_tab_forward

前进。调用 `browser_navigation`，`action: "forward"`。

### navigate_tab_reload

刷新。调用 `browser_navigation`，`action: "reload"`。

## 第五类：Tab 管理命令

### create_tab

创建新标签页。调用 `browser_tabs`，`action: "create"`。

### close_tab

关闭标签页。调用 `browser_tabs`，`action: "close"`。

### list_tabs

列出当前 session 的标签页。调用 `browser_tabs`，`action: "list"`。

### selected_tab

获取当前活跃标签页。调用 `browser_tabs`，`action: "selected"`。

### name_session

命名当前浏览器 session（显示为 tab group 标题）。调用 `browser_tabs`，`action: "name_session"`。

### finalize_tabs

清理 session 标签页。这是每个浏览器 turn 结束前的必要操作。调用 `browser_tabs`，`action: "finalize"`。

## 第六类：用户浏览器表面命令

### browser_user_open_tabs

列出用户的所有打开标签页（不只是 session 内的）。调用 `browser_user`，`action: "open_tabs"`。

### browser_user_claim_tab

将用户现有标签页纳入 session 控制。调用 `browser_user`，`action: "claim_tab"`。

### browser_user_history

搜索用户的浏览历史。调用 `browser_user`，`action: "history"`。

## 第七类：等待/同步命令

### playwright_wait_for_load_state

等待页面加载完成。调用 `browser_wait`，`action: "load_state"`。

### playwright_wait_for_url

等待页面 URL 变化到匹配条件。调用 `browser_wait`，`action: "url"`。

### playwright_wait_for_timeout

等待指定时间。调用 `browser_wait`，`action: "timeout"`。

### playwright_wait_for_file_chooser

准备文件选择器监听并立即返回 token；随后触发上传，再调用 set_files。调用 `browser_wait`，`action: "file_chooser"`。

### playwright_wait_for_download

准备下载监听并立即返回 token；随后触发下载，再调用 download_path。调用 `browser_wait`，`action: "download"`。

## 第八类：文件/下载/剪贴板命令

### playwright_file_chooser_set_files

设置文件选择器的文件。调用 `browser_io`，`action: "set_file_chooser_files"`。

### playwright_download_path

等待对应下载完成并返回文件路径；失败、取消或超时返回结构化错误。调用 `browser_io`，`action: "download_path"`。

### tab_clipboard_read_text

读取剪贴板文本。调用 `browser_io`，`action: "clipboard_read_text"`。

### tab_clipboard_write_text

写入剪贴板文本。调用 `browser_io`，`action: "clipboard_write_text"`。

### tab_clipboard_read

读取剪贴板（含图片等）。调用 `browser_io`，`action: "clipboard_read"`。

### tab_clipboard_write

写入剪贴板（含图片等）。调用 `browser_io`，`action: "clipboard_write"`。

## 第九类：开发调试命令

### tab_dev_logs

获取页面 console 日志。调用 `browser_debug`，`action: "logs"`。

## 关键行为

- Locator 使用自研 `window.__actspaceLocator` Runtime，支持结构化 target 与 CSS 兼容入口。定位、Frame 路由和 actionability 由 Go / 页面 Runtime 共同处理，不能套用旧 Playwright injected 对象。
- `fill` 的 `replace: false` 只聚焦后插入文本，插入位置取决于已有光标或选择区，不保证追加到末尾。
- 上传与下载是先监听、再触发、再取结果的 token 流程。准备阶段的 `is_multiple` 不能当作真实选择器已打开的证据。
- 导航通过 `Page.navigate` 的错误与 tab 状态轮询判断完成；不能把已发送命令当作页面已加载。CUA 操作也可能等待 tab 状态。
- 截图默认是当前视口；需要局部时按当前 schema 提供裁剪参数，不承诺默认整页截图。
- 显式 `finalize_tabs` 决定保留、移交和关闭的页面。连接结束释放 ownership，不等于关闭或移除用户页面分组。

## 安全门控

模型调用先经过 Agent mode / 调用范围门禁，再进入 Tool Runtime permission。`browser_help` 允许；未知 action 拒绝；只读 action 允许；写 action 在 default 模式下请求审批，full-access 按该模式允许。`browser_run` 对整批 action 判断风险，Go preflight token 绑定参数与 Turn，不能替代用户批准。

Go engine 校验 schema、backend 能力和 Session/tab ownership。当前没有远端站点策略，也没有一次允许就覆盖后续全部写 action 的 Session 授权租约。设置页 capability 偏好尚不能当作已接入的 action hard deny；详情见 [集成设计](agent-browser-use-integration-design.md)。

## 事件与结果边界

Extension 将 Chrome/CDP 事件转发给 Go，用于导航、等待、下载和日志编排。Runtime 调用通过 command RPC 获取结果，不依赖一套单独的 `onCDPEvent` / `onDownloadChange` 产品协议。

页面文本经过脱敏和裁剪后进入模型结果与 Session Journal；图片经 Session artifact 保存。UI preview 的简化不改变结果持久化边界。传输与输出上限见 [集成设计](agent-browser-use-integration-design.md)。

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
- 命令数量、schema、风险、backend 和实现状态以 Go registry 为机器事实来源。
