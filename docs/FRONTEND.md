# 前端协作说明

前端相关的编码规范、Skill 推荐和团队约定已迁移到 [`docs/coding-standards/`](coding-standards/README.md)。

如需添加前端特定的团队约定，请在 [`docs/coding-standards/team/`](coding-standards/team/README.md) 下创建对应文件。

样式作用域约定请优先查看：

- [`docs/coding-standards/team/frontend-style-scope-conventions.md`](coding-standards/team/frontend-style-scope-conventions.md)

改任何带颜色的样式前，必读主题与配色硬约束（颜色必须随主题翻转、禁止 `text-black`/`bg-white`/`#hex` 等非主题感知字面量、浅/深双主题都要验）：

- [`docs/design-docs/frontend/front-主题与配色规范.md`](design-docs/frontend/front-主题与配色规范.md)

字号、圆角、层级、阴影和动效时长只用 token（`text-act-*`、`rounded-act-*`、`z-(--act-z-*)`、`shadow-act-*`、`duration-(--motion-*)`），按钮只用 `components/ui/Button.tsx` / `IconButton.tsx`；`pnpm check:frontend-tokens` 会拦截写死值和未定义的 token。规则见 [`front-全局视觉语言规范.md`](design-docs/frontend/front-全局视觉语言规范.md)。

当前 renderer 的 Tailwind 页面切片迁移已完成收口，`styles/index.css` 是唯一全局样式入口，当前只导入 `tokens.css`、`tailwind.css`、`base.css`、`electron.css`、`markdown.css` 和 `diff.css`。旧根部 `styles.css` 与 `legacy-*` 分区已经下线；新增或排查样式时，必须优先确认样式所有权、cascade layer 和 CSS 加载顺序，避免普通 UI 样式回流到全局 CSS。

当前 `actspace` 桌面端的实际界面设计与组件定稿，请优先查看：

- [`docs/design-docs/frontend/README.md`](design-docs/frontend/README.md)
- [`docs/design-docs/frontend/front-全局视觉语言规范.md`](design-docs/frontend/front-全局视觉语言规范.md)
- [`docs/FRONTEND_VERIFICATION.md`](FRONTEND_VERIFICATION.md)

其中已经包含：

- 全局字体、颜色、间距、圆角、阴影和动效 token
- 左侧会话栏
- 中间消息区语法
- Composer 与 Context popup
- 右侧文件预览与会话级 diff
- 对应定稿图和原型 HTML

前端代码修改完成后，必须按 `FRONTEND_VERIFICATION.md` 说明选择合适的验收路径，并在最终说明中写明实际跑过的验证。

## 性能监控

设置 → 通用的性能开关默认关闭，开启后显示左栏底部面板（侧栏隐藏时紧凑显示）。监控组件独立更新，每两秒请求可信主进程 CPU/工作集内存采样；关闭与窗口隐藏停止采集。度量口径、投影优化和验收边界见 [执行摘要](exec-runs/20261001-performance-monitor-projection/execution-summary.md)。

性能面板仅以 `text-act-xxs`（11px）显示 CPU 与内存，无边框、无内边距、无展开明细；紧凑状态贴窗口边缘显示。使用统计费用汇总固定两位小数，底层金额和请求明细精度不变。
