# Ink & Emerald 前端设计系统文档收口计划

## 目标

把已确认的“中性灰阶工作台 + 黑色主操作 + 翡翠绿 operational accent”写成 ActSpace 的正式前端设计事实，清除 Cursor 营销站橙色、冷蓝品牌主色和旧组件色彩职责之间的冲突，同时明确本轮只更新文档、不宣称代码 token 已迁移。

## 范围

- 包含：
  - 重写根目录 `DESIGN.md` 为 `ActSpace Editor Design System` 总纲。
  - 更新前端设计入口、全局视觉语言和三态主题配色规范。
  - 同步 Sidebar、Composer、消息工具流、Settings、Usage、Kairos 的颜色职责。
  - 标记旧 PNG / HTML 为实现迁移前的历史视觉基线，不再让旧图覆盖新规范。
  - 更新 history，并完成文档和链接验证。
- 不包含：
  - 不修改 `tokens.css`、`tailwind.css`、React 组件或其他运行时代码。
  - 不制作新的 HTML 视觉样板。
  - 不删除历史设计图和原型。
  - 不把绿色直接替换所有旧 `brand` 使用点。

## 背景

- 设计方向：`Ink & Emerald / 墨色与翡翠绿`。
- 核心判断：灰阶承担约 95% 信息层级，绿色只承担约 2%–5% operational / success 语义。
- 关键分离：品牌气质、主操作色、operational accent、状态色和数据可视化色不能混成一个“品牌色”。
- 当前代码仍以既有蓝色 `brand` token 为主；本轮文档描述下一阶段目标态。

## 风险

- 风险：文档写成完成态，让后续开发误以为代码已迁移。
  - 缓解：所有目标色值和 token 明确标为 target，增加当前实现边界。
- 风险：把 `brand blue` 机械改成绿色，导致 CTA、链接、选中态全部变绿。
  - 缓解：先定义 action / operational / info / semantic 的职责，再规划 token 拆分。
- 风险：旧定稿图与新规范冲突。
  - 缓解：保留资产作历史参考，但在入口和组件规范中声明新文字规范优先。

## 验证方式

- `rg 'Cursor Orange|CursorGothic|品牌蓝仍可|蓝色是主强调色' DESIGN.md docs/design-docs/frontend docs/design-docs/kairos`
- `pnpm check:docs`
- `pnpm check:repo`
- `git diff --check`
- 检查设计文档 Markdown 相对链接。

## 进度记录

- [x] 确认设计方向和文档范围。
- [x] 重写设计系统总纲与前端入口。
- [x] 同步视觉、主题和组件规范。
- [x] 完成验证、history 和计划归档。

## 决策记录

- 2026-07-25：内部视觉方向命名为 `Ink & Emerald / 墨色与翡翠绿`，但不把产品描述成“黑绿主题”。
- 2026-07-25：浅色主题以暖中性灰为主，深色主题使用暖黑灰而不是纯黑。
- 2026-07-25：主操作使用主题反色的 ink action；翡翠绿是 operational accent，不是通用 CTA 或导航选中色。

## 验证结果

- `pnpm check:docs`：通过。
- `pnpm check:repo`：通过。
- `git diff --check`：通过。
- `docs/design-docs/` 目录深度检查：通过，一级专题目录下无子目录。
- 设计文档 Markdown 相对链接检查：61 个文件通过。
- 旧色彩职责扫描：未保留“蓝色是主强调”、“Usage 使用蓝色主色”或 Kairos 固定蓝黄红灰规则；`Cursor Orange` / `CursorGothic` 只出现在明确禁用的反例中。
