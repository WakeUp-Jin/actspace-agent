# 前端设计 token 收口与视觉修复 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260926-frontend-design-token-convergence.md`
- **执行过程**：`docs/exec-runs/20260926-frontend-design-token-convergence/execution-process.md`
- **执行模式**：交互
- **执行结果**：代码与文档完成；Electron 窗口验收待用户

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 字号 token `text-act-*` | `styles/tailwind.css` 与多数组件（renderer 共 80 个文件改动，其中组件 74 个） | 576 处写死字号与默认字号类替换；小于 11px 提到 11px；Composer 输入 16px |
| 阴影 token | `styles/tokens.css`、`tailwind.css` | 暖色基底；新增 xs / knob / thumb / float；补上从未定义的 `shadow-act-float` |
| 圆角、层级、时长 token | `tokens.css`、`base.css`、`electron.css` 与相关组件 | `rounded-act-group`；8 层 z-index；`duration-(--motion-*)`；全局减少动态效果兜底 |
| 可见问题修复 | `electron.css`、`SettingsPage.tsx`、`SettingsNav.tsx`、`Composer.tsx`、`UserMessage.tsx`、`ConversationView.tsx`、5 个消息块 | 右上角孤立横线、设置页顶部空带；Composer 12px 无阴影；用户卡无阴影；消息块 880px 对齐 |
| 基础按钮组件 | `components/ui/Button.tsx`、`IconButton.tsx`，设置、审批、Composer、Sidebar、右侧面板、对话框 | 统一尺寸、focus、disabled；图标按钮 `label` 必填并带 Tooltip |
| 防回流检查 | `scripts/check-frontend-design-tokens.mjs`、`scripts/test/frontend-design-tokens.test.mjs`、`package.json`、`check-repo-hygiene.sh` | `pnpm check:frontend-tokens`；含「引用的 token 必须已定义」 |
| 文档 | 5 份前端规范、`FRONTEND.md`、技术债、foundation 计划 | 已落地 token、按钮规则、未迁移清单 |

## 人工验证指引

没有 Computer Use，以下需要在 Electron 窗口里看（`pnpm dev:log`）。浅色、深色、跟随系统三态都看一遍。

### 必须验证

1. **窗口右上角与设置页顶部**
   - 验证方式：主界面收起右侧面板，看右上角面板开关下方；再打开面板；进入设置页。
   - 预期结果：面板收起时开关下没有横线；打开时 tab 行下有一条线；设置页顶部没有白色色带和贯穿全宽的线，左侧导航灰底延伸到顶，交通灯位置正常。
2. **Composer 与消息流**
   - 验证方式：新会话看初始 Composer；进入一个有工具调用和审批的长会话。
   - 预期结果：Composer 12px 圆角、无阴影，聚焦时边框略深；输入字号 16px；用户消息卡无阴影；Thinking、工具行、审批卡右缘与 Composer 对齐；发送按钮在无输入时是半透明的深色圆钮，Tooltip 为「输入消息后发送」。
3. **按钮**
   - 验证方式：设置 → 模型 / 搜索 / 更新 / 工具；打开「连接服务商」「移除服务商」对话框；在会话里触发一次审批（Bash 或写文件）。
   - 预期结果：设置按钮 28px、13px 字；对话框底部按钮 32px；「移除服务商」为实心红色；审批行 26px、卡片 28px 按钮与之前一致；Tab 键能看到清晰的焦点描边。
4. **浮层层级**
   - 验证方式：设置对话框里打开下拉菜单；右侧面板打开时在 Sidebar 右键会话；窄窗口（< 820px）打开侧栏抽屉后点标题栏按钮；Sheet 里悬停带 Tooltip 的按钮。
   - 预期结果：下拉菜单在对话框之上；右键菜单压在右侧面板之上；抽屉在标题栏之下、标题栏按钮可点；Tooltip 在 Sheet 之上。

### 建议验证

1. **Sidebar 图标按钮**
   - 验证方式：悬停「工作区」标题行和工作区行。
   - 预期结果：排序、添加工作区、新建会话按钮悬停出现，带 Tooltip（不再是系统 title 气泡），尺寸 22px。
2. **减少动态效果**
   - 验证方式：系统设置 → 辅助功能 → 显示 → 减少动态效果。
   - 预期结果：会话运行状态点不再脉冲，按钮与菜单无过渡动画；功能正常。
3. **Dialog 阴影**
   - 验证方式：打开图片生成设置、分支对话框。
   - 预期结果：对话框下有柔和阴影（此前 `shadow-act-float` 未定义，一直没有阴影）。

## Agent 已完成的验证

- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop test`：813 / 814 通过；失败的 1 例是 `src/main` 的 Git 环境用例，与本次无关（见执行过程）。
- `pnpm --filter @actspace/desktop build:renderer`：通过。
- `pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`node --test scripts/test/frontend-design-tokens.test.mjs`（5 / 5）：通过。
- 浏览器 renderer：17 个 fixture 页面浅 / 深快照。T7 等值替换差异为 0；其余任务的差异逐类核对为预期变化；截图检查了设置页、会话流、新会话、中文 UI、使用统计。
- 减少动态效果：CDP 模拟 reduce 后动画与过渡计算值 0.01ms。

## 已知风险和遗留事项

- 设置页按钮字号由 12px 变为 13px，内边距 11px → 10px（统一到审批卡的 28px 档）。
- 圆角 7px → 6px 影响设置输入框、下拉、分组内控件；9px → 8px 影响少量卡片。
- 未迁移的按钮形态（菜单项、下拉触发器、分段控件、表单内与输入框同排的控件）、间距写死值、内容 CSS 的 px 字号、dialog 18px 圆角：见 `docs/exec-plans/tech-debt-tracker.md`「前端设计 token 遗留」。
- `english-learning-preview.html` fixture 渲染为空白，未排查。

## 后续建议

- `DropdownMenu` / `Tabs` 落地时，按基础组件规范中的「不属于 Button」清单一起迁移，并删除剩余样式常量。
- 审查报告中仍待决定：标题栏 Activity 图标（对话 / 轨迹切换）含义不明；`CustomModelForm` 与连接状态块是否改为内嵌分组。
