# 前端协作说明

前端相关的编码规范、Skill 推荐和团队约定已迁移到 [`docs/coding-standards/`](coding-standards/README.md)。

如需添加前端特定的团队约定，请在 [`docs/coding-standards/team/`](coding-standards/team/README.md) 下创建对应文件。

样式作用域约定请优先查看：

- [`docs/coding-standards/team/frontend-style-scope-conventions.md`](coding-standards/team/frontend-style-scope-conventions.md)

改任何带颜色的样式前，必读主题与配色硬约束（颜色必须随主题翻转、禁止 `text-black`/`bg-white`/`#hex` 等非主题感知字面量、浅/深双主题都要验）：

- [`docs/design-docs/frontend-ui/主题与配色规范.md`](design-docs/frontend-ui/主题与配色规范.md)

当前 renderer 的 Tailwind 页面切片迁移已完成收口，`styles/index.css` 是唯一全局样式入口，当前只导入 `tokens.css`、`tailwind.css`、`base.css`、`electron.css`、`markdown.css` 和 `diff.css`。旧根部 `styles.css` 与 `legacy-*` 分区已经下线；新增或排查样式时，必须优先确认样式所有权、cascade layer 和 CSS 加载顺序，避免普通 UI 样式回流到全局 CSS。

当前 `actspace` 桌面端的实际界面设计与组件定稿，请优先查看：

- [`docs/design-docs/frontend-ui/`](design-docs/frontend-ui/index.md)
- [`docs/design-docs/frontend-ui/全局视觉语言规范.md`](design-docs/frontend-ui/全局视觉语言规范.md)
- [`docs/FRONTEND_VERIFICATION.md`](FRONTEND_VERIFICATION.md)

其中已经包含：

- 全局字体、颜色、间距、圆角、阴影和动效 token
- 左侧会话栏
- 中间消息区语法
- Composer 与 Context popup
- 右侧文件预览与会话级 diff
- 对应定稿图和原型 HTML

前端代码修改完成后，必须按 `FRONTEND_VERIFICATION.md` 说明选择合适的验收路径，并在最终说明中写明实际跑过的验证。
