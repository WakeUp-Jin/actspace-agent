# 设置 › 模型：获取可用模型弹窗与连接详情 V3

> 状态：2026-10-21 T1–T10 完成，未提交。Electron 实机与真实 Key 未验证，见[执行摘要](../../exec-runs/20261021-model-acquisition-picker/execution-summary.md)。

## 目标

把连接详情页按已确认的 Demo `docs/design-docs/frontend/model-provider-demo/connection-detail-v3.html` 实现：

- 模型列表就是这个连接里正在用的模型。没有「启用」开关，不要的模型直接移除。
- 获取模型统一走「获取可用模型」弹窗：用户勾选后添加，没有任何模型会被自动加入。
- 「手动添加」一直可用；获取失败或中转站没有开放列表时，自动展开手动添加。
- 每个模型是一张小卡片：整行可以点开，先显示三项关键字段，「显示更多」里是其余字段。删除按钮在行内，移除后在原位给「撤销」。
- 连接分组的每个字段都是输入框，失焦就保存，框内短暂显示「已保存」。

对话框（composer）不改。

## 已确认决策（2026-10-21，Demo 上确认）

| # | 决策 |
|---|---|
| V1 | 去掉模型的「启用」开关：加进列表 = 在用，不要就移除。 |
| V2 | 迁移时把已停用的模型直接移除。用途正在用它们的，改为跟随。 |
| V3 | 内置连接（DeepSeek / Kimi）的模型也可以移除，之后可以从「获取可用模型」再加回来。 |
| V4 | 所有连接类型（官方、聚合平台、中转）都用「获取可用模型」弹窗。参考 DeepSeek Harness 的做法：搜索、全选 / 取消全选、勾选，按钮写「添加 N 个」。已添加的模型打勾置灰并标「已添加」，**默认一个都不勾**。 |
| V5 | 新连接（官方也一样）的模型列表一开始是空的。连接建好后进入详情页，直接弹出选择窗口。 |
| V6 | 手动添加：填模型 ID，显示名称可选。目录里能精确认出的，自动填好上下文、思考和价格；只是变体的，按最接近的目录模型填，并提示「不对可以改」；认不出的留空，让用户自己填。 |
| V7 | 获取失败或没有列表时，在列表上方给出原因，并直接展开手动添加。 |
| V8 | 删除按钮在卡片行内，悬停或展开时出现。移除后原位显示撤销条（8 秒），不弹确认框。 |
| V9 | 连接分组用 A 方案：全部是输入框，失焦保存，框内显示「已保存」。API Key 输入后框内出现「取消 / 保存」。 |

## 实现取舍

| # | 取舍 | 原因 |
|---|---|---|
| J1 | 存储里的 `InstalledModelSettings.enabled` 字段保留，新写入一律为 `true`。视图层和 IPC 契约里去掉 `enabled`（`ConnectionModelView`、`ConnectionModelInput`、`ConnectionModelPatch`）。 | 这个字段贯穿 v1–v4 的迁移和 `model-resolver`。保留它、只保证不再出现 `false`，改动最小；运行时对 `model_disabled` 的判断成了一条不会触发的保护。 |
| J2 | 新增迁移 `layersVersion 1 → 2`：删除 `enabled:false` 的已安装模型，连同它们的定义和修改；用到它们的用途改为跟随。 | 对应 V2。沿用已有的迁移入口和备份。 |
| J3 | 「移除」采用延迟提交：先在页面里隐藏，并在原位显示撤销条；8 秒后，或者离开详情页、在这期间又移除了另一个模型时，才真正调用 `removeModel`。撤销只是取消这次提交。 | 先删后补的做法，在撤销时还原不了 `providerFacts` 和用途绑定。延迟提交可以完整撤销，最坏情况是应用在 8 秒内被关掉，这次移除没有生效，不会丢数据。 |
| J4 | 添加连接改成两步：选模板 → 填 Key。点「连接」后先请求 `/models`；连上之后以空模型列表 `create`，跳到详情页并把这次的探测结果交给它，详情页直接打开弹窗，不再请求第二次。删掉 `ModelSelectPage`。 | 对应 V5，选模型统一在弹窗里做。 |
| J5 | 内置服务商的第一份 Key 仍然落在 `<p>:default` 连接上（I1 不变），但 `create` 会先清掉这个连接下原有的已安装模型，让列表从空开始。 | 对应 V5。在没有 Key 时这些模型本来就看不到、也用不了，所以清掉不影响现有用户。 |
| J6 | 官方模板 `/models` 和目录取交集的规则保留（D3）。`/models` 不可用时退回目录模型，弹窗照样打开，描述里说明这些模型来自模型目录。 | 嵌入、语音这类模型不该出现在列表里。 |
| J7 | 变体自动填：预览命中的是非精确匹配时，草稿自动带上 `canonical`（沿用最接近的目录模型），用户可以改字段，也可以清掉。 | 复用已有的「沿用」机制，不新增数据字段。 |
| J8 | 内置连接的名称仍然只读，显示为禁用的输入框。 | 内置连接的名称来自模板，后端也不保存它的名称。 |

## 范围

**包含**

- `packages/shared/src/model-connections.ts`：契约去掉 `enabled`。
- `apps/desktop/src/main`：
  - `model-connections-service.ts`：
    - 去掉 `enabled`；允许移除内置模型。
    - `create` 时清空 legacy 连接原有的模型。
  - `settings/model-layers-migration.ts`、`defaults.ts`：加入 v2 迁移。
- renderer `components/settings/models/`：
  - `ConnectionDetailPage`：重写，连接分组改用 A 方案。
  - 新增 `ModelCard`，替换 `ModelList` 和 `ModelPanel`。
  - 新增 `FetchModelsDialog`。
  - 重写 `AddModelPanel`，改成草稿卡片。
  - `model-fields`：新增带单位的输入框、「已保存」提示和字段网格。
  - `ConnectionSetupPage`：改成「连接」后直接进入详情。
  - 删除 `ModelSelectPage`。
  - `ModelsPage`：修改路由。
  - `model-view`：去掉 `enabled` 过滤。
  - `ConnectionListSection`：模型数改成「N 个模型」。
- mock fixture、测试。
- 规范 `front-模型设置页面-Maka重做规范.md` 的 §4.1、§4.3–§4.5、§5.2、§5.3、§6.1、§10。
- `docs/histories/`。

**不包含**

- 对话框。
- 用途选择器的交互（只去掉 `enabled` 过滤）。
- 余额。
- 模板表。

## 任务

| # | 任务 | 验证 |
|---|---|---|
| T1 | shared 契约去掉 `enabled`。service 改动：<br>• `list` 不再输出 `enabled`<br>• `addModels` 一律以 `enabled:true` 写入<br>• `updateModel` 不再处理 `enabled`<br>• `removeModel` 允许移除内置模型<br>• `create` 时清空 legacy 连接原有的模型 | `model-connections-service.test.ts` |
| T2 | v2 迁移，规则见 J2；`MODEL_LAYERS_VERSION = 2`。 | `settings-model-layers-migration.test.ts` |
| T3 | `FetchModelsDialog`：<br>• 加载中、搜索、全选 / 取消全选<br>• 已添加的行置灰<br>• 「添加 N 个」<br>• 来源是目录时给说明；失败时由调用方处理 | `model-settings.test.tsx` |
| T4 | `ModelCard`：<br>• 行：logo、名称、ID、未知标记、摘要、删除、展开<br>• 展开区：三项关键字段（失焦保存，改过的字段可以「恢复」）<br>• 「显示更多」：名称、最大输出、缓存价、思考档位、输入类型<br>• 认不出的模型给提示 | 同上 |
| T5 | `AddModelPanel` 草稿卡片：<br>• ID + 显示名称<br>• 按预览结果分成认出、变体、认不出、重复四种情况<br>• 用同一套字段网格<br>• 回车添加，Esc 取消 | 同上 |
| T6 | `ConnectionDetailPage`：<br>• 连接分组改用 A 方案<br>• 模型区加「获取可用模型」和「手动添加」<br>• 获取失败时给提示，并直接展开手动添加<br>• 撤销条（J3）<br>• 中转连接才显示「计费与删除」，其余只有「删除」 | 同上 |
| T7 | 添加连接流程：<br>• `ConnectionSetupPage` 点「连接」→ `create` → 进入详情页并打开弹窗<br>• 删掉 `ModelSelectPage` 和 `select` 路由 | 同上 |
| T8 | mock fixture 同步；`model-view` 和连接列表去掉 `enabled`。 | `model-view.test.ts` |
| T9 | typecheck、renderer 和 main 测试、`check:*`；浏览器 mock 截图，看浅色、深色、480px 三种情况。 | 执行摘要 |
| T10 | 更新规范和 history，计划移到 `completed/`。 | — |

## 验收边界

- Electron 实机和真实 Key 由用户验证：
  - 新建 Kimi / OpenRouter 连接后会弹出选择窗口。
  - 中转站没有 `/models` 时会展开手动添加。
  - 内置模型可以移除，也能再加回来。
  - 迁移后之前停用的模型都不见了。
