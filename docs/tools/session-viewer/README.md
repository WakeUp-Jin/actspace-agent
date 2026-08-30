# Session Viewer

一个零依赖、完全离线的 `journal.jsonl` 查看器。它把高密度的事实流整理成可浏览的运行轨迹：先看 Session 总览和关键路径，再按需展开事件分组或回查单条 Envelope。不会上传或修改文件。

## 使用

在仓库根目录执行：

```bash
open docs/tools/session-viewer/session-viewer.html
```

然后把 Session 目录中的 `journal.jsonl` 拖到页面任意位置，或点击页面选择文件。拖拽到页面空白处、右侧说明区或左侧投放区都可以。

默认 Session 路径形如：

```text
<dataRoot>/sessions-v2/<sessionId>/journal.jsonl
```

## 支持格式

- 首行可为 `recordKind: "header"` 的 Session Header；
- 后续每行一个 `recordKind: "event"` 的 Event Envelope；
- 支持当前 13 种核心事件，以及扩展事件和插件事件；
- 会保留原始 JSON，不会执行文件中的脚本或 HTML；
- 非法 JSON 行会被标记并显示行号，其余有效事件仍可继续查看。

页面提供：

- Session 元数据、事件总数、Turn / Request / Tool / Error 计数和运行时长（Request / Tool 按关联 ID 去重）；
- 去除连续流噪声后的关键路径摘要，帮助先定位一次 Agent run 的主流程；
- 核心/扩展事件分布；
- 按核心流程、请求、工具、异常和高频流的快捷筛选，以及事件类型和关键词过滤；
- 连续的 `assistant/chunk`、`agent/inbox/spliced` 自动合并为一组，可展开查看原始事件；
- 事件时间线、序号、来源和提交状态；
- 单条事件的格式化 JSON 详情；
- 文件重新加载和清空当前数据。

## 安全提醒

查看器只在浏览器本地读取你主动选择的文件，不进行网络请求。Session Journal 可能包含工作区路径、提示词、工具参数、工具输出或其他敏感内容，请不要把包含凭据、Cookie、Authorization header 或个人数据的原始 Journal 分享给他人。

这是诊断工具，不是恢复工具：它不会修复、重排、写回或删除 Journal，也不会替代 Runtime 的 replay 和 invariant validation。
