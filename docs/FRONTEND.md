# 前端协作说明

前端相关的编码规范、Skill 推荐和团队约定已迁移到 [`docs/coding-standards/`](coding-standards/README.md)。

如需添加前端特定的团队约定，请在 [`docs/coding-standards/team/`](coding-standards/team/README.md) 下创建对应文件。

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
