# 消息流排版与工具摘要：执行摘要

状态：实现完成，未提交；真实桌面与部分视觉矩阵仍保留验收门禁。
关联计划：[已完成计划](../../exec-plans/completed/20260916-tool-stream-typography.md)。
执行过程：[过程记录](execution-process.md)。

## 交付内容

- 过程行统一到 14px 字号、22px 行高、400 字重；修复带结果 Read 字体继承与 Thinking 行盒差异。
- message flow 统一管理 5/14/23/18px 邻接间距，展开内容内部 7px、尾部 8px。组件不再用负 margin 抵消父层 gap。
- Read、搜索结果与文件变更标题区分动作、目标、元数据；保留未知工具原文和运行时 shimmer。
- Bash 主行呈现状态动作与命令，完整原因、耗时、退出码和普通沙盒信息在详情；真实环境、未执行与审批提示保持可见。
- Main 保留完整输出和原因，shared 补已有 intent 透传；不改变事件、持久协议、审批和分页。
- 保留文件文字打开文件与独立 disclosure 展开结果；Thinking 完成后自动收起，允许手动重开。
- 新增显式真实组件 fixture，更新设计规范、关联契约与学习记录。

## 工程验证

| 检查 | 结果 |
| --- | --- |
| Runtime 依赖闭包 build | 通过 |
| 计划内 8 个测试文件 | 107/107 通过 |
| shared test | 76/76 通过 |
| 追加 Worked / Explore / App 回归 | 38 通过、2 项范围外失败 |
| App 追加局部回归（keeps 筛选） | 4 通过、27 跳过，不代表整个文件通过 |
| desktop typecheck | 最终通过；中途修正测试查询误用的 exact 参数 |
| renderer build | 最终通过；有大 chunk 提示 |
| Electron main/preload build | 通过 |
| frontend-theme / docs | 通过 |
| 本轮生产改动 diff whitespace | 通过 |

desktop 全量首次运行：705/726 通过。摘要拆分后产生的 7 项查询失败已定向修正并验证；没有将全量重新运行后的通过数进行推算。其余失败分类：

- custom-connection-protocol 与 runtime-v2-thinking-options 共 12 项：测试 mock 缺少 DeepSeekFileUploader 导出。
- app-streaming-user-message 2 项：旧 Write 生成进度容器断言，以及工作区创建参数仍期待 title: New chat。

上述不作为本轮成功证据；没有借机修改模型接入或工作区创建行为。工作区还包含大量其他任务修改，本轮只改批准范围内的片段。

## 浏览器实测与边界

入口：`/src/renderer/test/fixtures/tool-stream-typography-preview.html`（开发服务器）；支持 `?theme=light`、`?theme=dark`、`?theme=system`。

- 修改前浅色真实组件测量：Thinking 14/20、500；带结果 Read 16/23.2；普通 Read/Bash 14/19.88。未保存修改前深色截图。
- 修改后实测 Thinking、Read 两分支、Bash、Write 为 14/22；过程间距 5px，过程到正文 14px。
- 浅色桌面完成态：Worked 可重新展开，Thinking 保持收起，最终正文独立显示。
- 深色 375px 窄列：长路径省略、未执行标记保留；document.scrollWidth 与窗口宽度均为 375，无页面横向溢出。
- 实际查看了浏览器截图；本轮没有保存到仓库的 PNG 文件，不能把空 screenshots 目录当作截图证据。

以下仍需人工验收：system 随宿主浅深切换；所有工具状态的完整浅深/窄宽交叉矩阵；真实 Electron 中旧会话恢复、按需详情、文件打开与 diff。浏览器 fixture 不具有真实 IPC，不替代这些门禁。

## 真实桌面验收

Computer Use 枚举未发现正在运行的 ActSpace / 当前 workspace dev app。现有启动日志只能证明之前启动过，不能证明窗口当前可用。本轮没有真实 Electron 交互通过证据，也没有发送真实模型请求。

后续操作：启动 `pnpm dev:log`，根据日志识别当前 workspace 窗口；打开已有包含 Thinking、Read、Bash、Write 的会话，依次检查 Worked、单项详情、文件打开、历史重新载入；分别切换浅色、深色、跟随系统，并缩窄窗口检查溢出。人工结果补在本文件，不需要重新改动已通过的排版实现。

## 回退

无数据迁移。仅撤销本轮排版、摘要与字段透传的局部改动；同文件存在其他任务内容，不能用整文件 checkout/reset 回退。未 commit、push 或部署。
