# 官网首页改版与全站轻量统一 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260926-site-homepage-redesign.md`
- **执行过程**：`docs/exec-runs/20260926-site-homepage-redesign/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成（T1–T9、T11 完成；T10 真实截图等用户提供）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 品牌紫 token、系统字体栈、合并 `:root` | `src/styles/tokens.css` | 全站唯一强调色；中英混排粗细一致 |
| Logo 透明化 | `src/assets/brand/actspace-logo.png`、`public/media/actspace-logo.png` | 任何底色都不露白框；原图另存 `actspace-logo-source.png` |
| 页头紫条、按钮/链接箭头、页脚一行化 | `global.css`、`SiteFooter.astro` | 站内 →，外链 ↗ |
| 首页首屏、能力卡片、更新条、桃色 CTA | `index.astro`、`global.css`、`showcase.css` | 按 demo 实现 |
| 展示区 16:10 底板、进度条、只淡化正文 | `FeatureShowcase.astro`、`showcase.css`、`showcase.ts`、`screenshots.json` | 图文对齐，不再像没加载完 |
| 文档/博客/更新日志轻量统一 | `DocsLayout.astro`、`prose.css`、`blog.css`、`UpdateTimeline.astro` | 版式不变 |
| 删除 14 个无引用旧文件 | `components/home/*` 等 | 构建仍 45 页 |

## 同宽截图对照清单

| 页面 | 宽度 | 结果 |
|------|------|------|
| 首页首屏 | 1440 / 1100 / 760 / 390 | 两栏底部对齐；“空间”各宽度都不拆行（1100 起两行，h1 调为 5.6vw）；760 及以下首图只露聊天区 |
| 首页展示区 | 1440 / 1100 | 六段逐段切换，图片在底板内完整居中（含细长 Skills 图），进度条同步，非当前段标题可读 |
| 首页能力卡片、更新条、CTA、页脚 | 1440 / 390 | 与 demo 一致；插画与桃色底无色差 |
| 文档 `/docs/getting-started/` | 1440 / 390 | 只多了紫色当前项边线、链接下划线、标题 600 |
| 博客 `/blog/` | 1440 | 页头紫条；其余不变 |
| 更新日志 `/updates/#release-2026-09-24` | 1440 | 紫色标签；落点条目浅紫高亮后淡出 |

## 人工验证指引

### 必须验证

1. **首页整体观感**
   - 验证方式：打开 `http://127.0.0.1:8765/actspace-agent/`，与 `docs/design-docs/website-redesign-demo.html` 并排看。
   - 预期结果：首屏、展示区、卡片、更新条、CTA 与 demo 一致。
2. **展示区滚动与键盘**
   - 验证方式：1440 宽慢速滚动；再用 Tab 走到各段“了解 …”链接。
   - 预期结果：图片与进度条随段落切换；Tab 聚焦的段落完全清晰。
3. **Logo 边缘**
   - 验证方式：浏览器放大到 300% 看页头、页脚 Logo。
   - 预期结果：无白框、无白晕。

### 建议验证

1. **博客卡片悬停与分类勾选**：`/blog/` 悬停卡片（紫边上移），勾选分类（紫色勾）。
2. **reduced-motion**：系统开启“减少动态效果”后滚动首页，无过渡。
3. **矮窗口**：把浏览器窗口高度缩到 700px 以下，展示区应退回普通图文顺序。
4. **手机菜单**：390 宽展开菜单，Escape 收起。

## Agent 已完成的验证

- `pnpm --filter @actspace/site check`：0 错误 0 警告 0 提示。
- `pnpm --filter @actspace/site test`：23 个测试通过。
- `pnpm --filter @actspace/site build`：45 页，与改动前一致。
- 首图 `loading="eager" fetchpriority="high"`；CTA 插画为 lazy WebP（420w/840w）。
- `grep "↗"`：只剩 GitHub 外链与博客详情“复制链接”按钮。
- 上表所列截图逐张检查。

## 已知风险和遗留事项

- **T10**：`context-detail.png` 仍是格式测试会话，需要用户在真实开发任务中重拍（要求见 `apps/site/SCREENSHOTS.md`）；`workspace-overview.png` 建议一起重拍。
- 5 张素材已无引用（`assets/hero/cloud-expanse.png`、`screenshots/context-and-approval.png`、`workbench-home.png`、`usage-overview.png`、`kairos-runtime.png`），待用户决定是否删除。
- Windows 上字体回落到微软雅黑，观感与 Mac 不同，已在 DESIGN.md 注明。
- 展示区 sticky 顶部公式按约 560px 的图片高度估算，超宽屏（>1728px）时图片略偏上，可接受。

## 后续建议

- 用户提供新截图后：替换 `context-detail.png`，把 `screenshots.json` 状态改回 `ready`，四宽度复查，然后把计划移入 `completed/`。
