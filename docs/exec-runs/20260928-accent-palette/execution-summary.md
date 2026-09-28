# 外观强调色：执行摘要

## 交付

- 「设置 → 外观 → 强调色」：默认 / 蓝 / 紫 / 粉 / 橙，浅深共用一个选择，只作用于 renderer（`<html data-accent>`，存 `actspace.appearance.v1.accentPalette`）。
- 强调色驱动：Composer 发送按钮、开关开启态、焦点框与输入框 focus、普通链接、文字选中、分割线拖动。
- 不变：普通主按钮、导航 / 列表选中、语义与数据色、用户消息卡、原生 chrome。默认调色板所有 token 回落原值。
- `pnpm check:frontend-theme` 校验注册表 ↔ CSS 块、色样、语义 token 与 4.5:1 对比度。

## 证据

- 单测：appearance 8、settings-page 28、composer + settings-color-semantics 54，全部通过。
- 检查：`check:frontend-theme`、`check:frontend-tokens`、desktop `tsc` 通过；主题检查反向验证有效。
- 截图：`accent-grid.png`、`appearance-light.png`、`appearance-dark.png`，结论见执行过程 T6。

## 剩余

- Electron 人工验收（按 `docs/FRONTEND_VERIFICATION.md`）：三态主题 × 5 个调色板，查看发送按钮 hover、设置页与 Composer 开关、Tab 焦点、Markdown 链接、真实文字选中、分割线拖动；确认「跟随系统」切换时强调色跟着换浅深值。
- `pnpm check:docs` 仍被 main 上已有的 `active/20260926-site-homepage-redesign.md`（已完成仍在 active）阻塞，与本次无关。
