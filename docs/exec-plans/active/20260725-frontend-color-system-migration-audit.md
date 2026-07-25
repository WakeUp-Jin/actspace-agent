# Frontend brand consumer audit

## Snapshot

- Audit date: 2026-07-25
- Source: canonical repository working tree (same Git HEAD as this worktree)
- Git HEAD: `9826852bb915eedec050a232c06800b48db9710f`
- Snapshot state: includes uncommitted renderer work that is not yet present in this Codex worktree
- Brand-related files: 40
- Brand-related lines: 159
- Theme-literal files requiring separate review: 14
- Coverage check: all 159 scanned lines are classified exactly once

The delivery worktree is on the same Git HEAD and contains 36 files / 147 lines. The four additional canonical dirty-worktree files are:

- `components/settings/ModelPurposeSelect.tsx`
- `components/settings/ModelSettings.tsx`
- `components/settings/OpenRouterModelCatalogDialog.tsx`
- `components/settings/ProviderSettings.tsx`

Decision on 2026-07-25: the user chose a one-worktree delivery, so the 36-file / 147-line snapshot became the implementation baseline. The four files above belong to a separate uncommitted multi-provider feature and were not copied without their shared/main/preload dependencies. `check:frontend-theme` will reject legacy consumers when that feature is later merged.

## Classification totals

| Target responsibility | Scanned lines |
|---|---:|
| neutral | 73 |
| action | 10 |
| operational | 19 |
| success | 2 |
| info | 17 |
| visualization | 9 |
| compatibility | 21 |
| non-runtime | 8 |

`compatibility` covers legacy token/utility definitions rather than component consumers. `non-runtime` covers comments and tests. Warning and danger do not appear as target categories here because their existing consumers already use dedicated semantic tokens rather than `brand`.

## Consumer map

Line numbers refer to the canonical repository snapshot above.

| File | Classified line numbers | Migration intent |
|---|---|---|
| `packages/desktop/src/renderer/components/Composer.tsx` | neutral: 78, 96, 112, 118, 134, 160<br>operational: 141<br>visualization: 956<br>non-runtime: 137 | 附件/菜单/选中/drop 回归 neutral；Toggle on 为 operational；Context ring 进入阈值/数据语义。 |
| `packages/desktop/src/renderer/components/ConversationView.tsx` | neutral: 47, 51 | 消息操作菜单 hover、expanded 与菜单项均为 neutral。 |
| `packages/desktop/src/renderer/components/LabPage.tsx` | action: 121<br>neutral: 125, 150, 166, 177<br>visualization: 139<br>success: 568<br>info: 707 | 主 CTA 为 action；卡片选中、focus、Tab 为 neutral；阶段色与检查结果保留专门语义。 |
| `packages/desktop/src/renderer/components/PlaceholderView.tsx` | neutral: 15, 16 | 占位图标与 eyebrow 不再承担全局品牌色。 |
| `packages/desktop/src/renderer/components/RightPanel.tsx` | neutral: 35, 45, 46, 57, 61 | Tab、菜单、对象入口及 focus 全部回归 neutral。 |
| `packages/desktop/src/renderer/components/SessionHoverPreview.tsx` | visualization: 25 | Context usage bar 属于用量可视化。 |
| `packages/desktop/src/renderer/components/ShutdownOverlay.tsx` | operational: 39 | 关闭过程 spinner 表示正在执行。 |
| `packages/desktop/src/renderer/components/Sidebar.tsx` | operational: 153, 233, 235, 236<br>neutral: 211 | 状态点为 operational；重命名 input focus 为 neutral。 |
| `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx` | neutral: 47, 49, 303, 471, 678, 816, 835, 1004<br>visualization: 145, 962, 1047, 1067, 1069, 1117<br>info: 1039 | 控件层级回归 neutral；heatmap、分布、cache 与表格强调进入 visualization；成本详情为 info。 |
| `packages/desktop/src/renderer/components/kairos/KairosContextSheet.tsx` | neutral: 308<br>success: 312<br>info: 424, 561 | 复制按钮 hover 为 neutral；复制成功为 success；展开链接与 role badge 为有限 info。 |
| `packages/desktop/src/renderer/components/kairos/KairosNotifications.tsx` | action: 233<br>neutral: 373, 413<br>info: 407 | 撤销是明确 action；未读底色/文字为 neutral；普通通知点为有限 info。 |
| `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx` | neutral: 20, 31 | 工具菜单 hover/focus 为 neutral。 |
| `packages/desktop/src/renderer/components/messages/BrowserApprovalBlock.tsx` | action: 20<br>info: 73 | 允许按钮为 action；浏览器来源图标为 info。 |
| `packages/desktop/src/renderer/components/messages/CompactCommandBlock.tsx` | operational: 15, 17 | 压缩进度条表示运行过程。 |
| `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx` | action: 36 | 文件 diff 主操作为 action。 |
| `packages/desktop/src/renderer/components/right-panel/ContextRenderView.tsx` | info: 58 | Context 详情入口为 info link。 |
| `packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx` | action: 35<br>operational: 266<br>info: 275<br>non-runtime: 31 | 主按钮为 action；running badge 为 operational；reply identity 为 info；注释不计消费者。 |
| `packages/desktop/src/renderer/components/right-panel/PreviewSourceToggle.tsx` | neutral: 6 | 预览/源码切换选中为 neutral。 |
| `packages/desktop/src/renderer/components/right-panel/ReplyHtmlRenderView.tsx` | neutral: 22, 26, 27 | 按钮、popover hover 与 selected 为 neutral。 |
| `packages/desktop/src/renderer/components/right-panel/ReviewRenderView.tsx` | action: 54<br>info: 93, 100 | 加载/恢复主动作使用 action；renamed 与 hunk 进入 diff/info。 |
| `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx` | neutral: 19 | 对象菜单 hover 为 neutral。 |
| `packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx` | neutral: 18 | 文件树 hover 为 neutral。 |
| `packages/desktop/src/renderer/components/settings/FileWatchSettings.tsx` | info: 156 | 文档/详情链接为 info。 |
| `packages/desktop/src/renderer/components/settings/KairosSettings.tsx` | neutral: 39, 528, 733, 1059, 1288, 1342, 1409<br>operational: 1249 | 按钮 hover 与输入 focus 为 neutral；启用状态为 operational。 |
| `packages/desktop/src/renderer/components/settings/ModelPurposeSelect.tsx` | neutral: 8 | Select focus 为 neutral。 |
| `packages/desktop/src/renderer/components/settings/ModelSettings.tsx` | info: 64<br>neutral: 66 | 跨设置入口为 info；添加模型次级按钮为 neutral。 |
| `packages/desktop/src/renderer/components/settings/OpenRouterModelCatalogDialog.tsx` | neutral: 56, 76 | 搜索 focus、刷新与添加按钮 hover 为 neutral。 |
| `packages/desktop/src/renderer/components/settings/PluginsSettings.tsx` | info: 309 | 外部/详情入口为 info。 |
| `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx` | neutral: 80, 83, 147, 148, 150<br>action: 87, 153 | 测试/编辑/input focus 为 neutral；添加服务和保存为 action。 |
| `packages/desktop/src/renderer/components/settings/SettingsNav.tsx` | neutral: 37 | 设置导航选中为 neutral。 |
| `packages/desktop/src/renderer/components/settings/SettingsPage.tsx` | action: 56<br>neutral: 58, 1026, 1435<br>operational: 593, 633, 649 | 主按钮为 action；次级按钮与输入 focus 为 neutral；更新进行中状态为 operational。 |
| `packages/desktop/src/renderer/components/settings/SettingsPrimitives.tsx` | operational: 85<br>neutral: 170, 171, 206, 305, 306, 341, 506, 566 | Toggle on 为 operational；Select/MultiSelect 选中和 focus/hover 为 neutral。 |
| `packages/desktop/src/renderer/components/settings/SkillsSettings.tsx` | neutral: 15 | 次级按钮 hover 为 neutral。 |
| `packages/desktop/src/renderer/components/settings/fs-watch-shared.ts` | action: 12<br>neutral: 14<br>operational: 30 | 主按钮为 action；次级按钮为 neutral；启动中为 operational。 |
| `packages/desktop/src/renderer/pages/KairosPage.tsx` | info: 102, 351<br>operational: 133, 1055<br>neutral: 156, 376, 692, 902<br>non-runtime: 130, 153 | reply 色为有限 info；运行主状态为 operational；分页、选中行和菜单 selected 为 neutral；注释不计消费者。 |
| `packages/desktop/src/renderer/styles/base.css` | operational: 127, 144 | running shimmer 与 reduced-motion 静态表达为 operational。 |
| `packages/desktop/src/renderer/styles/markdown.css` | info: 109, 115 | Markdown link 为 info。 |
| `packages/desktop/src/renderer/styles/tailwind.css` | compatibility: 27, 28, 29 | 迁移期 brand utility 映射，消费者清零后删除。 |
| `packages/desktop/src/renderer/styles/tokens.css` | compatibility: 20, 21, 22, 23, 131, 132, 133, 151, 157, 158, 202, 203, 204, 205, 290, 291, 292, 293 | light/dark/system-dark 旧 brand 与 accent alias，最后阶段删除。 |
| `packages/desktop/src/renderer/test/composer.test.tsx` | non-runtime: 195, 385, 389, 393 | 测试断言；随 Composer 语义 class 更新。 |

## Literal-color boundary

The canonical scan finds 14 renderer files containing `text-black`, `bg-black`, `bg-white`, arbitrary hex, or `rgba()`. These are not automatically defects. During each slice migration they must be classified as one of:

- semantic token candidate;
- overlay or scrim;
- shadow or glow;
- Toggle thumb;
- media or decorative color;
- visualization color;
- third-party brand color.

The future guard must also cover `text-white`, ring/outline/fill/stroke/gradient channels, and CSS `rgb(a)`, `hsl(a)`, and `oklch` literals. Allowlist entries must identify the exact file, literal or pattern, and reason.

## Reproduction

```sh
rg -l --glob '*.{tsx,ts,css}' "brand|--act-color-brand" packages/desktop/src/renderer
rg -n --glob '*.{tsx,ts,css}' "brand|--act-color-brand" packages/desktop/src/renderer
rg -l --glob '*.{tsx,ts,css}' "text-black|bg-black|bg-white|text-\\[#|bg-\\[#|border-\\[#|rgba\\(" packages/desktop/src/renderer
```
