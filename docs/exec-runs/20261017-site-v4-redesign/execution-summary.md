# 官网 V4：运行空间叙事与纸本插件舞台 — 执行摘要

> 2026-10-18 状态校准：阶段 A 及 T9/H1 精修已合入 main。首页最终使用桌面插件舞台和真实界面功能块；下文“无截图”是首轮方案，后续 T9/H1 已替代。阶段 B 文档重写与截图标注仍未实施。

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261017-site-v4-redesign.md`
- **执行过程**：`docs/exec-runs/20261017-site-v4-redesign/execution-process.md`
- **执行模式**：交互
- **执行结果**：阶段 A 与两轮验收修改（T8、T9）完成（未提交，分支 `feat/site-redesign-v4`）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 纸本 token 与标题衬线 | `apps/site/src/styles/tokens.css` | 全站共用一套颜色、色场与字体 |
| 首页重写 | `src/pages/index.astro`、`src/components/home/*`、`src/styles/home.css`、`src/scripts/home-*.ts` | 首屏插件舞台；现状 + 三个方向；无截图 |
| 删除旧首页 | `FeatureShowcase.astro`、`showcase.ts`、`showcase.css`、`SHOWCASE_PLAN.md` | V3 滚动图文不再使用 |
| 全站统一 | `DocsLayout.astro`、`prose.css`、`blog.css`、`editorial.css`、`roadmap.astro`、`404.astro` | 只换视觉，不改结构 |
| 产品理念落点 | `src/content/docs/what-is-actspace.md` | 首屏「阅读产品理念」链接目标 |
| 规范同步 | `apps/site/DESIGN.md`、`SCREENSHOTS.md` | V4 设计规范 |
| 真实界面功能块（T9） | `FeatureShot.astro`、`home-focus.ts`、`assets/screenshots/home/*`、`home-features.ts` | 五块真实界面截图依次聚焦要点；删除「实拍」区 |
| 开发计划对齐（T9） | `docs/roadmap.md`、`roadmap.astro` | 三个方向卡 + 补齐完成项 |
| 文档补充（T9） | `harness-tools.md`（新）、`context.md`、`agent-turn.md`、`what-is-actspace.md` | Harness V1、上下文面板、执行轨迹入口、去重复导语 |

## 人工验证指引

### 必须验证

0. **首页真实界面块（T9）**
   - 验证方式：滚到「改了什么，一眼看清。」及之后各块，等一轮；悬停、点按要点；点「查看原图」。
   - 预期结果：先全貌，再依次放大到要点区域，紫框对准对应内容；悬停停住、离开继续；原图弹窗打开 PNG。

1. **首屏插件舞台**
   - 验证方式：`pnpm --filter @actspace/site dev`，打开 `http://127.0.0.1:8765/actspace-agent/`，看完一轮（约 13 秒）；悬停插件、点击「编辑」「终端」开关。
   - 预期结果：用到的插件依次点亮、连线流动；关掉「编辑」后没有改动且计数减少；关掉「终端」后终端不出现。
2. **整体观感**
   - 验证方式：在真实浏览器（Safari / Chrome）1440 宽和手机上滚完首页、文档、博客。
   - 预期结果：字体为 Charter + 宋体衬线标题，风格一致；无横向滚动。

### 建议验证

1. **减少动态效果**
   - 验证方式：系统设置开启「减少动态效果」后刷新首页。
   - 预期结果：首屏和三个功能块直接显示终态。
2. **文档复制页面**
   - 验证方式：任意文档页点「复制页面」。
   - 预期结果：提示复制成功（无头环境没有剪贴板权限，未能自动验证）。

## Agent 已完成的验证

- `pnpm --filter @actspace/site check`：0 错误；`test`：23 通过；`build`：45 页。
- 首页 1440×900、1100×800、390×844 截图；首屏与上下文面板分时单帧无空白帧。
- 插件开关、reduced-motion 终态、三个宽度 `scrollWidth == innerWidth`。
- 博客筛选、排序、视图切换，390 宽文档目录（T6 子 Agent）。

## 验收后追加（T8）

- 首页「现状」末尾新增「实拍」区：Review 全景大图 + 上下文弹层 + 审批卡片，点击放大看原图。
- 文档、博客、更新日志与首页实拍共用纸面相框。
- 修复页头 Logo 白框（开发服务器缓存旧图，改名解决）；favicon、apple-touch、OG 图更新为 V4。
- 删除已失效的 V3 计划；文档链接测试允许链到站内页面。

## 首轮风险与后续状态（2026-10-18 核对）

- 首轮 1100 宽终端叠层与头像观察对应 H1 之前的布局；H1 已改为桌面插件舞台，近期官网逐项验收见 20261018 报告。
- 引用与状态色的观感意见保留为设计观察；近期官网验收未将其登记为产品缺陷。
- 已消除：开发计划现已包含「Harness 自进化」「Actor 与 Space」，与首页三个方向一致；不再将旧缺项作为当前风险。
- 首轮旧实拍素材问题已由 T9 的真实界面功能块替代；当前截图清单与待补项以 `apps/site/SCREENSHOTS.md` 为准。

## 后续建议

- 用户验收阶段 A 后，立阶段 B 计划：文档正文重写、截图裁切与标注。
