# 轮尾改动卡与交付文件卡

## 用户诉求

一轮回复结束后，Agent 到底改了什么、交了什么东西，现在要靠翻 `Worked for` 里的工具日志才能知道。参考 DeepSeek Harness 的做法，在最终回复下面直接给两张卡；图片仍按 ActSpace 自己的表现（用户原话：「图片还是按照我们自己的来，我们自己的就挺好的」）。

## 主要改动

- 后端：filesystem-read 插件新增 `present` 工具（最多 4 个文件，只用 `lstat` + realpath 认定工作区内的普通文件）；提示词加 `core/output-choice`，只在 Agent 模式输出。
- 投影：shared 新增 `present` 预览、`PresentedFile` 与 MessageBlock；tool-card 从 `detail` 读文件并补工作区输出路径；流式路径和工具行同步渲染。
- main：新增 `file-applications-service.ts`（macOS JXA 查关联应用，含图标与本地化名称，按路径缓存）和 `workspaces.listFileApplications` / `workspaces.openFile`（`open` | `reveal`）；路径统一走 `withWorkspaceAccess` 与 realpath 校验。
- renderer：
  - 移植 DSH 的 `FileTypeIcon`、`CodeFileIcon` 和 48 个代码图标（颜色改用 `--act-file-type-*`），附 MIT 声明。
  - `turn-tail/turn-tail-data.ts`：只从本轮已完成的工具事件推导改动与交付；新建文件的 diff 去掉幽灵空行；本轮新建又删掉的文件直接去掉。
  - 改动卡：单文件 / 多文件头部、`+/-` 合计、折叠；悬停 500ms 弹出 diff 浮层（宽度为卡片宽 − 48，最高 420px，移出 200ms 关闭）。
  - 每轮 Review 标签：右侧新增 `turnReview` 标签类型，改动快照随标签传入，含左右对比 / 单栏、自动换行、文件菜单和打开整个文件。
  - 交付卡：卡片网格、超过 4 个折叠、点击预览、右键走 main 的文件菜单；默认应用按钮 + 关联应用下拉，末项「显示文件位置」，远端会话改为经 Host 下载。
  - `TurnOutputArtifacts` 收缩为只渲染生成图片。
  - 设置新增「显示本轮代码改动」（默认开，只隐藏改动卡），用一个模块级共享订阅读取，切换即时生效。
- mock：`turn-deliverables` 场景两轮数据（改 7 个文件、交付 5 个、含新建后删除的临时脚本）；`mock-db` 支持按轮附带的工具事件并投影成 `tool-result`。

## 设计动机

- **两张卡而不是一张。** 「改了什么」是过程产物，「交给你什么」是 Agent 主动声明的结果，语义不同：前者按文件汇总行数，后者要文件描述和打开方式。混在一起会让「打开方式」出现在每个改动文件上，也会让交付文件被行数淹没。
- **数据来自工具事件，不来自 git。** 非 git 工作区也要能看；而且卡片要和本轮 Agent 的动作一致，不该被用户手改的工作区状态污染。
- **交付走新工具而不是解析回复。** 从正文猜文件路径容易误报，也让模型没法表达「这份是终稿」。`present` 让 Agent 显式声明，还带一句描述。
- **Review 标签随标签传数据。** 不复用基于 git 的 `ReviewWorkspace`，这样非 git 工作区可用，且内容与改动卡严格一致。
- **图片留在自己的组件里。** 图片是像素产物、走图片预览链路，和代码文件的 diff / 打开方式没有交集，沿用原有列表更合适。
- **开关只隐藏改动卡。** 想安静读回复的人不需要每次看到文件行数；但交付文件是 Agent 主动给的，隐藏它会丢失真实信息。

## 验证

- 单测：`turn-tail.test.tsx` 10 项、`turn-tail-data.test.ts` 10 项、`turn-output-artifacts.test.tsx` 15 项、`mock-bridge.test.ts` 20 项。
- 其余链路：filesystem-read 8 项、prompt output-choice、core/agent 17 项、runtime 组合 13 项、selector / tool-preview、file-type-icon 18 项、main 37 项。
- 检查：`check:frontend-theme`、`check:frontend-tokens`、`check:ipc-channels`、`check:renderer-bridge` 通过；desktop renderer / main typecheck 通过。
- 浏览器截图：`docs/exec-runs/20261013-turn-deliverables-cards/screenshots/`（亮色、暗色、悬停浮层、480px）。
- 留给用户：Electron 里真实调用 `present`、用 Word / Excel 打开、在 Finder 中显示。

## 参考

- 计划：`docs/exec-plans/active/20261013-turn-deliverables-cards.md`
- 过程与摘要：`docs/exec-runs/20261013-turn-deliverables-cards/`
- demo：`docs/design-docs/frontend/turn-deliverables-demo.html`
- 参考源码：`tmp/deepseek-harness`（MIT，`tmp/deepseek-harness/LICENSE`）
