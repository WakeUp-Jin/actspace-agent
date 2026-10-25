## [2026-10-21 22:34] | Task: 设置 › 模型：获取可用模型弹窗与连接详情 V3

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

按确认的 V3 Demo 重做连接详情：去掉启用开关；所有连接都用「获取可用模型」弹窗让用户手动勾选，什么都不预先勾；也能按 ID 手动添加并自动补全；删除在行内、可以撤销；连接字段失焦即保存。

### 变更与动机

- 契约和 service 去掉模型的 `enabled`，内置模型可移除，`create` 清空旧连接的预置模型；v2 迁移删掉停用模型并把相关用途置空。加进来就是在用，状态只有一种，页面不再需要开关。
- 新增 `FetchModelsDialog`、`ModelCard`；重写 `AddModelPanel`、`model-fields.tsx`、`ConnectionDetailPage`；新建连接改为「连接 → 空连接 → 详情页弹窗」，删掉 `ModelSelectPage`、`ModelList`、`ModelPanel` 和 `select` 路由。
- 移除走 8 秒延迟提交加撤销条，避免误删要重新填字段。
- 规范 §4–§6、§10 按新流程改写；计划移到 `completed/`。

### 关键文件

- `packages/shared/src/model-connections.ts`
- `apps/desktop/src/main/model-connections-service.ts`、`settings/model-layers-migration.ts`
- `apps/desktop/src/renderer/components/settings/models/`：`ConnectionDetailPage.tsx`、`FetchModelsDialog.tsx`、`ModelCard.tsx`、`AddModelPanel.tsx`、`model-fields.tsx`、`model-view.ts`、`ConnectionSetupPage.tsx`、`ModelsPage.tsx`
- `apps/desktop/src/renderer/test/model-settings.test.tsx`、`model-view.test.ts`
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`

### 验证与边界

- desktop vitest 1926 项通过；tsc（desktop / electron / shared）通过，仅剩已有的 `markdown-blocks.test.tsx` 报错；settings 金标按预期重新生成。
- `check:frontend-tokens` 仍报 composer `ModelPicker.tsx` 超基线，来自已有的未提交改动，未处理。
- 浏览器 mock 截图见 `docs/exec-runs/20261021-model-acquisition-picker/`。Electron 和真实 Key 未验证；未提交。
