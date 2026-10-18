# Context 面板「路径」卡片执行过程

计划：[20261018-context-paths-panel](../../exec-plans/completed/20261018-context-paths-panel.md)。分支 `codex/context-incremental-design`，与同分支其他任务的未提交改动共存；本轮未提交、未推送。

## 设计确认

- 子智能体（Sonnet）梳理披露引擎：活跃路径以导航行进入补充上下文，不含全文；睡眠只在索引里；上限 100；只在应用压缩时按 `readsInCycle > 0 || addedCycle === cycle` 筛选、按读取次数 / 最近读取 / 加入周期 / id 排序取前 100。
- Demo `docs/design-docs/frontend/context-paths-demo.html` 三轮迭代。用户选方案 A（会话统计下方独立卡片，标题「路径」），保留「待唤醒 / 将睡眠」预判标签。第二轮误把整张卡片收起，用户纠正为：周期和两格统计常显，只有列表用一个小下拉开关收起。
- 用户批准实施，同意预判由后端给出、前端不复刻规则。

## 里程碑 1：共享规则与预判字段

- `packages/shared/src/context-panel.ts` 新增 `compareContextPaths`、`selectNextActivePathIds`、`ContextPathEntry.nextCompaction`。
- 引擎 `comparePaths` 与 disclosure 插件 `selectActive` 改为调用 shared 同一函数，行为不变（Desktop 不依赖 context-engine，规则只能放 shared）。
- `context-paths.ts` 按当前周期算下次活跃集合：活跃不在集合内标 `sleep`，睡眠在集合内标 `wake`。
- 验证：shared / engine / disclosure 构建通过；engine 25、disclosure 21、Desktop `context-paths.test.ts` 4 项通过（新增预判用例覆盖保留、未读将睡眠、本周期新加入、重读待唤醒、闲置睡眠）。

## 里程碑 2：Renderer 卡片

- `ContextPaths.tsx`：标题与周期 HelpHint、两格统计（兼当切换、`aria-pressed`、满额警示色与提示）、列表开关（`aria-expanded`）、按目录 / 平铺胶囊、错误与重试、分批「再显示」、Token 脚注。
- `ContextPathList.tsx`：分组或平铺行；新 / 待唤醒 / 将睡眠标签；读取次数与相对时间；悬停复制；点行展开完整路径和元数据。
- `use-context-paths.ts`：按 `(sessionId, revision, visibility)` 管理分页；收起或页面隐藏不请求；单请求在途；核对响应 revision / visibility；按 id 去重（含同页重复）；stale / cursor 错误清空并调用面板 `refresh` 一次，再错留给用户重试；卸载后丢弃迟到结果。
- `ContextPanel` 仅在后端数据源时渲染卡片；过渡视图说明改为「趋势、事件和路径需要后端数据，暂未提供」。`use-context-panel` 暴露 `refresh`。
- Mock：`context-paths-fixture.ts` 确定性生成路径并用 shared 规则算预判；默认 87 / 342；`context-pagination` 为 100 / 1284、每页 400ms、首次读睡眠失败一次。
- 原生按钮：`ContextPaths.tsx` 4 处（统计格、列表开关、按目录 / 平铺两个胶囊），`ContextPathList.tsx` 1 处（整行展开），均写明原因，在 `scripts/native-button-baseline.json` 只追加这两行（自动更新会重排整个文件，未采用）。

## 里程碑 3：验证与文档

- 首次运行新测试时同页重复 id 未被去重，改为边过滤边记录。
- 浏览器 mock（Vite 5199 + 无头 Chrome CDP，2x）截图见 `screenshots/`。截图发现两格统计按钮内容默认垂直居中导致「活跃」「睡眠」标签不齐，改为 `flex-col justify-start`；窄面板脚注折行，缩短为「导航行已计入「补充上下文」，不重复计 Token」。
- 更新交接文档（状态、`nextCompaction` 字段、源码入口、P1–P8 说明）、右侧面板规范（六个区块）、前端验证场景表、后端数据需求中的 mock 说明。
