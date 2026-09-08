# 日常主界面中文统一执行摘要

状态：2026-09-09 实现和代码验证完成。计划已归档到 completed，全仓文档检查通过。

## 交付

- 日常桌面界面中文化：侧栏、输入框普通操作、工作区/Git 控件、右侧面板及现有设置残留文案。
- 保留 Chat、Plan、Thinking、Effort、思考档位及工具执行名称/执行过程。工具执行组件、main 与 packages 无本轮变更。
- 斜杠菜单支持中文和原英文关键词；终端默认标题创建/恢复/重启一致；未知上下文分类与自定义标题保留原值。
- 不做语言切换、自动翻译或数据迁移，不改用户内容、模型输出、文件/分支名和持久化名称。

## 工程验证

- `pnpm --filter @actspace/desktop typecheck`：通过，覆盖 renderer 与 Electron 类型。
- `pnpm --filter @actspace/desktop build:renderer`：通过；保留 Vite 已有大 chunk 提示。
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test --maxWorkers=2`：57 个文件、432 个用例通过。
- 最终说明文本收尾后补跑 `settings-page.test.tsx` 和 `context-render-view.test.tsx`，分别为 24 与 8 个用例。
- 新增设计、学习、history 的中文标点检查通过；源码差异空白检查通过。
- `pnpm check:docs`：通过，覆盖 40 个当前正式文档及设计、归档、计划、执行记录的链接与资源。归档计划后同步了索引及其他任务记录中指向本计划的链接。

## 已观察的界面

- 真实 Electron 开发窗口：会话主界面及通用设置，中文导航、输入提示、状态与原始内容正确，通用没有新增语言入口。
- 浏览器独立样例：1280px 浅色工作台与上下文弹窗，680px 深色输入框/模式/模型菜单，375px 内容宽度的模型设置。所见文案无明显溢出。
- Chat、Plan、Thinking 保留英文；Effort 档位由现有 Composer 回归用例验证。

## 复核步骤与边界

1. 运行 `pnpm dev:log`，根据日志中的当前开发应用名打开 Electron；不要选择旧安装版。
2. 检查侧栏右键菜单、输入框加号/模型/斜杠菜单、工作区分支入口、右侧变更审查/上下文/文件及设置。
3. 测试 `/上下文`、`/context` 和 `/pla` 能找到对应命令；命令本身保留英文。
4. 既有 New chat 或 Default workspace 名称来自数据，保持原样；原生 Electron 菜单、轨迹详情、工具卡片、独立扩展和外部内容不宣称中文覆盖。
5. 终端真实创建/恢复/重启、Git 写操作和真实 Provider 调用未额外执行；本轮相关展示与交互由组件回归验证，不代表这些外部能力重新验收。

独立验收入口：`http://127.0.0.1:5173/src/renderer/test/fixtures/chinese-ui-preview.html`，支持 `?theme=dark&width=680`。样例不会连接模型或修改实际会话。
