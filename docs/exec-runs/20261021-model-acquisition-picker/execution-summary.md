# 执行摘要：获取可用模型与连接详情 V3

- 计划：[20261021-model-acquisition-picker](../../exec-plans/completed/20261021-model-acquisition-picker.md)
- 规范：[设置 › 模型重做规范](../../design-docs/frontend/front-模型设置页面-Maka重做规范.md)（§4.1、§4.3–§4.5、§5.2、§5.3、§6.1、§10）
- Demo：`docs/design-docs/frontend/model-provider-demo/connection-detail-v3.html`
- 分支：`fix/settings-model-select`（未提交）
- 日期：2026-10-21

## 交付内容

- **没有启用开关**：模型加进来就是在用，不要就移除。契约去掉 `enabled`，存储仍写 `enabled: true`。`MODEL_LAYERS_VERSION = 2` 的迁移删掉停用模型，指向它们的用途改为跟随会话默认（`null`）。内置模型也可以移除。
- **「获取可用模型」弹窗**（`FetchModelsDialog`）：所有连接共用。默认一个不勾；已添加的打勾置灰，标「已添加」。支持搜索、全选 / 取消全选（只作用于可见、未添加的行）。按钮显示「添加 N 个」。列表来自模型目录时，描述里说明。
- **新建连接**：「连接」成功后创建一个空连接，带着这次的探测结果进入详情页并自动弹窗。拿不到列表时给出原因，并自动展开手动添加。旧的选模型页（`ModelSelectPage`、`select` 路由）已删除。
- **手动添加**（`AddModelPanel`）：输入模型 ID 后边输入边预览，分四种情况：
  - 精确认出：直接填好。
  - 变体：自动按最接近的目录模型填（设 `canonical`），可以点「不是它」取消。
  - 认不出：留空让用户填。
  - 重复：提示已在列表里。
  字段和模型卡片用同一套网格。回车添加，Esc 取消。
- **模型卡片**（`ModelCard`）：整行可以点开，展开后先给上下文、默认思考、价格三项，「显示更多」里是名称、最大输出、缓存价、思考档位、输入类型。改完失焦就保存；改过且有原值的字段显示「已修改 · 恢复」。认不出的模型给提示，能一键「按 X 填」。
- **移除与撤销**：删除按钮在行内，悬停或聚焦时出现，展开时和 ≤600px 时常驻。移除后原位出现撤销条，说明会影响哪些用途。8 秒后才真正移除；离开页面、关掉撤销条或又移除了别的模型时也会提交。撤销后卡片闪一下。
- **连接分组 A 方案**：每个字段都是输入框，失焦保存，框内短暂显示「已保存」。API Key 粘贴后框内出现「取消 / 保存」。内置连接的名称只读。中转连接才有「计费与删除」（价格倍率），其余只有「删除」，删除分两步确认。
- 规范与计划已同步更新。

## 自动化证据

| 检查 | 结果 |
|---|---|
| `tsc -p apps/desktop/tsconfig.json` | 通过；仅剩已有的 `markdown-blocks.test.tsx` NodeList 报错（与本次无关） |
| `tsc -p apps/desktop/tsconfig.electron.json`、shared tsc | 通过 |
| desktop vitest 全量 | 244 文件通过 / 2 跳过；1926 项通过 / 7 跳过 |
| `model-settings.test.tsx` | 12 项：新建官方连接弹窗勾选、坏 Key、无列表中转自动手动添加、手动添加重复 / 变体、卡片字段保存与恢复、撤销与关闭、全选、名称已保存、倍率回退、两步删除、内置名称只读、OpenRouter 管理 Key |
| `model-view.test.ts` | 新增 token / 价格解析、`modelMeta`、`canRestore` |
| `settings-model-layers-migration.test.ts`、`model-connections-service.test.ts` | 通过（v2 迁移、内置模型可移除、`create` 清空旧模型） |
| settings 金标 | 按预期重新生成：`layersVersion` 2；v2 fixture 删掉停用的 `deepseek-flash`，explore 变为 `null` |
| `check:ipc-channels`、`check:renderer-bridge`、`check:frontend-theme` | 通过 |
| `check:frontend-tokens` | 本次文件通过（`FetchModelsDialog` 一个整行勾选按钮已入基线）；仍报 composer `ModelPicker.tsx` 6 > 5，来自已有的未提交改动，本次未动 |

## 截图（浏览器 mock）

- [浅色 · 中转连接，卡片展开](screenshots/1-light-relay.png)
- [浅色 · 显示更多、撤销条、变体草稿](screenshots/2-light-more-undo-draft.png)
- [深色 · 获取可用模型弹窗](screenshots/3-dark-picker.png)
- [浅色 · 480px](screenshots/4-light-480.png)

## 未覆盖与已知限制

- Electron 实机和真实 Key 未验证，清单见[验收交接](acceptance-handoff.md)。
- 撤销的倒计时只在页面内存里；应用在 8 秒内退出时，这次移除不会提交（模型保留）。
- 未提交，等用户确认。
