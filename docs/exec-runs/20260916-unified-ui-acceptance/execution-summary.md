# 执行摘要

状态：统一计划已完成，Computer Use 已启动并完成首批真实 Electron 检查；全矩阵尚未完成。统一测试计划见 [test-plan.md](test-plan.md)。

## 继续测试结果（2026-09-16）

新执行 16 个测试文件，合计 **212 通过、2 失败**，其中 15 个文件全通过，App 文件 29 通过、2 失败。不是全量测试，也不是 Electron UI 验收。

- 第一批 60/60：session-list-page、runtime-v2-tool-stream、file-generation-counter、runtime-v2-subagent-activity、context-render-view、file-diff-block、tool-stream-typography、markdown-prose、agent-run-block、explore-run-block、session-store。
- 第二批 152/154：app-streaming-user-message、sidebar、workbench-responsive、composer、runtime-v2-fixed-renderer-projection。
- 失败 1：`finishes multiple write tools independently as each tool_finished event arrives`，无法找到文本 `Write first.ts`。
- 失败 2：添加工作区的 createSession 参数断言不匹配，测试仍期待 `title: 'New chat'`。两项都需进一步定位，不能直接断言是产品缺陷或仅测试陈旧。

恢复真实窗口时，右侧系统提示词显示 9,531 Token、工具 3,409 Token；之前该系统项是 3,694。当前只有跨时间观察，没有重新打开同一时点的三处数据，记为待核实而非确认缺陷。

后续 Computer Use 控制入口当前不可用，无法继续点击；独立 node_repl 没有 cua 绑定。需恢复本会话 Computer Use 能力后继续 T01–T08。没有临时改主题/进度设置，没有发新 Provider 请求或改产品代码。

### Computer Use 恢复后的追加证据

- T02 部分通过：轨迹入口真实可切换；空态和筛选工具栏正常，返回对话后旧消息完整恢复。
- T07 浅色真实 Electron 通过：行内代码、代码块、中文正文可读，长 URL 在代码块内裁切，未见页面横向溢出。
- T01 部分通过：右侧对象菜单列出工作区文件、Review、终端、可视化回复、上下文；重复选择上下文会去重，未出现重复 Context Tab。多类型 Tab 和关闭后焦点回退仍未完成。
- T06 明细再次确认：右侧为 23 条，系统提示词 9,531 Token、工具 3,409 Token。底部为 0%；仍缺同一时点 popup 总量，因此继续标记“待核实”，不报确定缺陷。

Computer Use 已恢复可用；本轮仍未改主题设置或发送 Provider 请求。

开发进程在继续验收时退出过一次，完整 `pnpm dev:log` 已重启成功。重启后的 workspace 依赖构建通过、Electron watch typecheck 为 0 errors；旧会话和分页首屏恢复，右侧面板以关闭状态启动。开发进程当前保持运行。

## 本轮直接证据

- 8 个原会话逐个读取最后 5 条消息，7 项有实现记录；会话切换中断仅完成定位，不能算修复完成。
- 依赖构建、Electron main/preload 构建通过。复用本 workspace 的既有 5173 renderer，启动当前开发 Electron。
- 真实窗口 `Actspace Dev actspace-agent-2067` 成功恢复旧会话，消息正文与 Composer 可见。
- T02 部分通过：commerce-agent 首屏 10 项，点击 Show more 后追加到 20 项，前 10 项保留，当前消息没有替换。长会话向前翻页、滚动锚点及错误重试尚未验收。
- T06 部分通过：Composer popup 显示约 7K / 1M、0%，分项可见；点击“查看完整上下文”打开右侧 Context，显示 23 条上下文及系统提示词 3,694 / 工具 3,409 Token 等明细。顶部悬停与三处完整口径一致性尚未完成。
- T01 部分通过：Context Tab 经真实入口打开；多 Tab、关闭及窄面板矩阵尚未完成。
- T07：已查看真实长代码消息截图；行内代码所在段落尚未完成专项截图检查，不计通过。
- T08：浏览器深色真实组件 fixture 已加载；尚未完成本轮交互矩阵，不计通过。
- T03/T04/T05 真实 Provider 测试未执行；未发送新模型任务，未生成测试文件。

## 环境与保留状态

首次 dev:log 遇到沙箱 EPERM；获准后遇到同 workspace 已占用 5173，未杀掉原服务。单独构建/启动 Electron 后进入真实窗口。启动器自行修复开发 runtime 缓存缺失项，Chromium 报缓存结构错误但窗口及 IPC 已可用，未清理用户缓存。

Computer Use 响应显著缓慢：原生单次约 60 秒，首次浏览器绑定约 9 分钟。这个耗时属于自动化工具观察，不作为应用加载性能结论。当前原生窗口停在原有会话的 Context Tab；主题和写入进度设置尚未修改，因此无需恢复设置。开发 Electron 留在运行状态。

仅新增本测试目录的文档，未改产品源码、未提交或改变既有暂存内容。后续从 T02 长会话、T06 顶部悬停、T01 多 Tab 开始，再执行专用测试会话与主题矩阵。不得将本摘要解读为全功能测试通过。
