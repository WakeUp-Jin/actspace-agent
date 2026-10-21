# 模型设置页面 Maka 风格重做规范

> 2026-09-06 范围更新：分析观测功能与专用 Analysis / Trace 接口已退役。下文保留该页面或验收其入口的原计划条目已失效；Journal、聊天、Trajectory、Context 与 Usage 仍保留。
>
> 2026-10-21 改版：模型页按四层数据模型（协议 / 服务商模板 / 连接 / 模型）重做，Demo 见 `model-provider-demo/index.html`，计划见 `docs/exec-plans/completed/20261021-model-provider-redesign.md`。§3.1、§4、§5、§6.1、§9、§10 按新设计重写；旧的「发丝卡片」、多选下拉、自定义服务向导、`billingMode` 三种计费都已删除。

## 文档状态

- **状态**：已确认，已实现（2026-10-21），Electron 实机验收待做。
- **适用范围**：ActSpace Desktop 设置中心的「模型」页面：用途表、连接列表、添加连接（选模板 → 填 Key → 选模型）、连接详情与模型管理。
- **上位规范**：`front-设置中心重构规范.md`、`front-全局视觉语言规范.md`、`front-主题与配色规范.md`。
- **数据契约**：`packages/shared/src/model-layers.ts`（有效值解析）、`provider-templates.ts`（模板表）、`model-connections.ts`（IPC 契约）。
- **参考证据**：`tmp/maka/apps/desktop/src/renderer/settings/providers-panel.tsx`、`provider-catalog-page.tsx`、`provider-connection-detail.tsx`、`settings-route-header.tsx`、`settings-rows.tsx`。

本文是 ActSpace 模型页面的具体实现规范。它参考 Maka 的页面语法和交互，不复制 ActSpace 不具备的 Runtime Host、账号订阅和远程能力。

## 1. 重做目标

当前模型页面的问题不是某个颜色或间距，而是用户模型错误：Provider 连接、余额、接入信息和模型目录被堆成多层卡片，配置流程被拆成卡片与 Dialog，用户看不到“我现在处于连接列表、连接详情还是服务商目录”。

重做后的模型页面必须让用户在一个连续流程中完成：

```text
用途 → 连接列表 → 添加连接（选模板 → 填 Key → 选模型） → 连接详情 → 模型
```

视觉目标是 Maka 的安静、连续、低装饰设置页：列表优先、路由优先、开放式行优先，卡片只用于真正独立的摘要或警告。

## 2. 参考结论

### 2.1 直接采用

| Maka 机制 | ActSpace 采用方式 |
| --- | --- |
| `ProvidersPanel` 的 list / catalog / setup / detail 路由 | 模型页面内部状态路由，所有子页共用页面壳层 |
| `SettingsRouteHeader` | 子页统一使用返回、图标、标题和副标题 |
| Provider catalog 的搜索与分类 | 添加服务目录使用搜索和筛选，服务商使用平铺列表 |
| `SettingsRows` / `SettingsExpandableRow` | 连接详情使用两列开放式设置行，短值默认只读，编辑时局部展开 |
| Provider connection detail | 连接、请求设置、模型和删除操作分区展示 |
| 空态、Banner、retry 和 loading 状态 | 每个异步路由都有明确的加载、空、错误和恢复状态 |

### 2.2 明确不复制

- 不增加 `Local`、Runtime Host、远程项目或账号订阅选择器。
- 不引入 Maka 的 Bot Chat、记忆、宠物、每日回顾等功能。
- 不把图片生成、图片分析和联网搜索伪装成普通文本模型连接。
- 不改变 ActSpace 的 ModelKey、凭据存储、Session Journal 或 Usage 数据边界。

## 3. 页面层级与布局

### 3.1 标题层级

> 2026-10-15 改：二级路由的标题提升为页面级 `h2`，返回箭头放进标题行（macOS 系统设置的做法）。组件是 `SettingsPrimitives.tsx` 的 `PageHeader`；「模型」页的 `PageShell` 不传 title，页头由 `models/ModelsPage.tsx` 按路由自己画。

```text
列表        h2 模型                      ├── h3 用途 / h3 模型连接
添加连接    [‹] h2 添加连接
填 Key      [‹] [logo] h2 模板名
选模型      [‹] [logo] h2 选择模型
连接详情    [‹] [logo] h2 连接名称       ├── h3 连接 / 模型 / 计费与删除
            副标题：官方 / 自定义中转 · 连接状态 · 余额
```

规则：

- 页面主内容区域始终只有一个页面级 `h2`：列表页是「模型」，二级页是该路由自己的标题。
- 二级页的返回是标题行最左侧的 28px ghost `IconButton`（`ChevronLeft` 18px），aria-label / Tooltip 为「返回 + 目标」，例如「返回模型」「返回添加连接」；按钮向左探出 8px，让箭头和下方内容左边缘光学对齐。
- Dialog 内部的 `h2` 只属于 Dialog 局部语义，不计入页面标题。
- 子路由切换时不渲染「模型」大标题，也不在标题上方另放返回链接。

### 3.2 页面壳层

```text
┌──────────────┬──────────────────────────────────────────────┐
│ 设置导航     │ 模型                                         │
│              │ 用途、模型连接与模型管理。                   │
│              │                                              │
│              │ 当前路由内容                                 │
└──────────────┴──────────────────────────────────────────────┘
```

- 设置侧栏继续由 `SettingsNav` 管理。
- 内容列使用稳定的宽度和左边缘，桌面端建议 `max-width: 880px`。
- 页面标题、路由标题和列表内容共享同一左边缘。
- 页面背景使用主题 token；分组用设置中心通用的 inset `SettingGroup`，模型清单用一个带描边的列表框（`LIST_FRAME`），行之间画分隔线。
- 不用“白底大卡片套灰底小卡片”的默认组合。

## 4. 路由与页面

> 2026-10-21 改：组件全部在 `apps/desktop/src/renderer/components/settings/models/`。样式用 Tailwind 语义 token；`styles/model-connection.css` 只剩少量 `.mc-*` 规则，新增样式优先写 token 类。

### 4.1 列表 `list`

```text
模型

用途
  会话默认       新会话一开始用的模型          Claude Sonnet 4.5 · 高 ›
  轻量任务       起标题、写摘要、压缩上下文    DeepSeek V3.2         ›
  自动审批       判断工具调用能否自动放行      跟随会话默认          ›
  子 Agent 探索  读代码、搜资料的子 Agent      Claude Haiku 4.5      ›
  看图           当前模型看不了图时，由它代看  跟随会话默认          ›

模型连接                                             添加连接
  [logo] DeepSeek                      2 / 2 个模型              ● 可用
  [logo] Claude 中转 [中转]            3 / 4 个模型  1 个待补充  ● 可用
  [logo] OpenRouter                    0 / 0 个模型              ○ 未测试
```

- **用途**（`PurposesSection` + `PurposePicker`）：5 项，每项存「模型 + 思考档位」。除会话默认外都可以选「跟随会话默认」。点开是一个可搜索的选择器，按连接分组列出已启用的模型；「看图」只列能看图的模型。选中某个模型后，底部显示它的上下文、价格和思考档位（单选）；不认识的模型给「去补充」，跳到所在连接并展开这个模型。模型的思考只有开 / 关两档时显示「开 / 关」，没有选择余地时不显示档位。绑定的模型被删除或停用后，这一项显示「模型已不可用，重新选择」。
- **模型连接**（`ConnectionListSection`）：整行是 `button`，点进详情。行内是 Logo、名称（中转连接加「中转」标签）、启用数、待补充数（已启用但什么都不知道的模型）和连接状态；不放测试、编辑、删除按钮。
- Logo 映射必须通过显式 Provider registry；未知服务使用中性占位标识，禁止复用其他供应商 Logo。资源出处与许可证见 `apps/desktop/src/renderer/assets/provider-marks/README.md`。中转连接用中性标识，不从模型名推断品牌。
- 余额、Base URL、代理和凭据状态不在列表中展开。

### 4.2 选模板 `catalog`

- `TemplateCatalogPage` 按模板表（`provider-templates.ts`）分「官方」「聚合平台」「自定义」三组列出，顶部可搜索。
- 服务商使用整行列表；已添加过的官方模板只标「已添加」，仍可再加一条（比如换一把 Key）。

### 4.3 填 Key `setup`

- 官方模板只填 API Key；服务地址固定为模板地址，不显示。
- 「自定义中转」填服务地址、协议（OpenAI Chat / OpenAI Responses / Anthropic Messages）和 API Key，可选名称和代理。
- 主按钮「测试并获取模型」：请求 `/models`。Key 无效时留在本页，错误以 `role="alert"` 显示在表单下方。
- 中转站没有开放模型列表时，直接进入选模型页并展开「添加模型」。

### 4.4 选模型 `select`

- `ModelSelectPage` 列出拿到的模型，每行一个复选框；`/models` 失败的官方模板退回列出模型目录里该厂商的模型。
- 默认勾选目录里能精确匹配的模型；一个都匹配不上时全部勾选。不认识的标「不在模型目录中」，日期后缀的标「像是 … 的日期版本」。
- 列表可搜索；底部有「添加模型」（就地展开，见 §5.3）、价格倍率和「保存连接」。保存后进入新连接的详情页。

### 4.5 连接详情 `detail`

```text
[‹] [logo] Claude 中转
    自定义中转 · ● 可用 · 余额 ¥86.52

连接
  名称        Claude 中转
  协议        Anthropic Messages ▾       按中转站文档选
  服务地址    https://relay.example.com
  API Key     ••••••••••••  已保存在本机        更换
  管理 Key    未设置  查余额用                   填写      （仅 OpenRouter）
  代理        http://127.0.0.1:7890     留空走系统代理

模型  3 / 4 个启用。点开可以看上下文、价格，改默认思考。   重新获取
  ┌──────────────────────────────────────────────────┐
  │ [A] Claude Sonnet 4.5                       [开] │
  │ [A] Claude Haiku 4.5                        [开] │
  │ [A] claude-sonnet-4-5-20250929  像是 Claude Sonnet 4.5 的日期版本 [开] │
  │ [?] qwen3-coder-plus  不在模型目录中        [关] │
  │ +  添加模型                                      │
  └──────────────────────────────────────────────────┘

计费与删除
  价格倍率    中转站打几折就填几。                 官方价 × [0.6]
  删除连接    删除后这个连接的模型都会移除。       删除
```

- 标题副行显示「官方 / 自定义中转」、连接状态，以及余额（DeepSeek、Kimi、OpenRouter 模板，已填 Key 时）。
- 名称：内置连接（`*:default`）只读；协议：只有中转连接可改。
- 所有输入框失焦或回车才提交；不合法的值（例如倍率填了非数字）退回原值。
- Key 只显示掩码，「更换」后就地输入，保存或取消。
- 「重新获取」重新请求 `/models`：新模型加入列表但默认不启用；服务没有开放列表时只提示。
- 删除连接两步确认：第一次点变成「确认删除」，3 秒内不点就复原。有用途正在用这个连接的模型时，说明删除后这些用途改为跟随。
- 不再有「测试连接」按钮（D10），也没有多 Key（D11）。

## 5. 模型

### 5.1 有效值

每个模型字段的有效值 = 用户修改 > 服务商 `/models` 数据 > 模型目录 > 未知，并记录来源（`EffectiveModel.sources`）。在 main 的 `ModelStoreService.getModelSnapshot()` 里统一算一次，运行时、对话框、设置页都读这一份；renderer 不再自己按目录算能力。

- 思考档位统一为 `off / low / medium / high / xhigh / max`（关 / 低 / 中 / 高 / 超高 / 最高）。每个模型声明自己支持哪几档，可以设默认档。
- 价格 = 参考价 × 连接倍率；单个模型手填的价格不乘倍率。
- 模型引用始终使用 Provider-qualified `ModelKey`，格式不变。

### 5.2 模型行

- 收起时只有家族标识、名称、备注（不认识 / 日期版本）和启用开关。
- 点开后，已知模型只显示三项关键信息：上下文、价格（倍率生效时标 `×0.6`）、默认思考；其余收进「更多设置」：显示名称、上下文、最大输出、思考档位、看图、价格，以及「恢复目录值」「取消沿用」。
- 未知模型点开显示「沿用已知模型」（填目录模型 ID）和必填三项（上下文、价格、思考档位）。沿用之后按已知模型显示。
- 可删除的模型底部有「移除模型」（`danger` 按钮）；内置连接的模型只能停用。
- 停用或移除正在被用途使用的模型时，这些用途改为跟随。

### 5.3 添加模型

- `AddModelPanel` 在列表里就地展开：先填模型 ID，输入时防抖调 `preview`。
- 命中目录时显示 ✓ 和三项关键信息；只是日期近似时给出建议；未命中时显示「沿用」和必填三项，其余收进「更多设置」。
- 按钮只有「取消」和「添加」，没有「测试」（D10）。

## 6. 交互与状态

### 6.1 路由状态

```ts
type ModelsRoute =
  | { name: "list" }
  | { name: "catalog" }
  | { name: "setup" }
  | { name: "select" }
  | { name: "detail"; connectionId: string; expand?: string };
```

- 路由状态只保存在 renderer 页面状态，不写入设置数据；添加流程的草稿（模板、Key、探测结果）保存在 `ModelsPage` 的 context 里。
- 每个写操作返回整份 `ModelConnectionsView`，页面直接替换，不做本地乐观合并。
- 连接被删除时，详情路由退回列表。

### 6.2 异步状态

所有列表、目录、余额、模型发现和保存动作必须区分：

- 初始加载：骨架行与正式列表互斥，本地连接设置读完后立即替换。远程余额独立加载，其延迟或失败不得阻塞列表和添加连接入口。
- 成功：显示真实数据和下一步动作。
- 空态：说明原因并提供主动作。
- 失败：错误靠近受影响内容，保留重试入口。
- 保存中：禁用重复提交，保留当前表单草稿。
- 保存成功：更新连接列表，不泄露密钥。

### 6.3 操作反馈

- 所有可点击连接行在按下时有轻微 scale 或背景反馈，频繁导航不使用页面动画。
- 普通路由切换不做大幅滑动动画。
- 保存成功用设置中心统一的「已保存」提示，不弹 toast。
- 目录搜索不使用延迟弹跳或自动滚动。

## 7. 数据与安全边界

- API Key、Management Key、搜索 Key 和图片 Key 只在 main / secret store 可用。
- renderer 只接收凭据存在状态、连接状态和脱敏地址。
- 删除连接不删除 Session、Journal 或 Usage。
- 失效模型保留原引用并显示原因，不静默换成另一个模型。
- 设置页只通过 `modelConnections` IPC 域（list / probe / create / update / remove / addModels / updateModel / removeModel / preview / updatePurposes / getBalance）读写。
- `tmp/maka` 只作为参考源码，不参与 ActSpace runtime、构建或数据目录。

## 8. 响应式和可访问性

- 桌面宽度 1280px：内容列稳定、列表不压缩，详情两列设置行保持标签和控件对齐。
- 480px 及以下：详情行折叠为上下结构，操作按钮自然换行，触控目标至少 40px。
- 所有图标按钮提供 `aria-label`。
- 连接行使用真实 `<button>`，分组使用语义标题；用途选择器是 `listbox` / `option`，思考档位是 `radio`。
- 目录搜索、返回、保存、取消和删除动作支持键盘操作。
- Dialog 仅用于真正需要确认的危险操作，必须有焦点陷阱和恢复焦点。

## 9. 当前实施边界

- **模板**：官方（Anthropic、OpenAI、DeepSeek、Kimi、智谱 Z.AI、MiniMax、火山方舟 Coding Plan、小米 MiMo）、聚合平台（OpenRouter）和「自定义中转」都是模板表里的一行。DeepSeek、Kimi、OpenRouter 不再是特殊 provider；旧的 `deepseek:default` / `kimi:default` / `openrouter:default` 连接保持原存储，只在视图层统一成连接（实现取舍 I1）。
- **用途**：模型选择只在「模型 › 用途」。「通用 › 模型与生成」「通用 › 媒体」「子 Agent」「工具 › 看图」只保留跳转入口。
- **计费**：没有 reference / token / manual 三种模式，统一为参考价 × 倍率；迁移见 `docs/histories/2026-10/` 的记录。
- **不做**：OAuth 与订阅登录、多 Key 轮换、一个连接同时支持两种协议、对话框（composer）界面改动。
- 后续扩展模板前，必须先在模板表里补齐协议、默认地址、目录厂商、余额能力和 Logo。

## 10. 验收标准

### 视觉

- 列表页首屏能看到 5 个用途和所有连接，不依赖滚动寻找主要动作。
- 模型行收起时只有名字和开关；点开只显示三项关键信息。
- 页面主内容只有一个 `h2`，分组为 `h3`。
- 浅色、深色、480px 宽三种情况都没有溢出或截断。

### 功能

- 可选择每个用途的模型和思考档位，并改回跟随。
- 可添加官方连接（只填 Key）和中转连接（`/models` 失败时手动添加）。
- 可在详情中改名称 / 协议 / 地址 / Key / 代理 / 倍率，启停、展开、修改、沿用、移除、添加模型，重新获取列表，删除连接。
- 余额只在支持的官方连接上显示。

### 工程

- 设置页只走 `modelConnections` IPC 域。
- `model-view.test.ts`、`model-settings.test.tsx`、`settings-page.test.tsx` 覆盖路由、标题契约和主要流程。
- 通过 Desktop typecheck、renderer 测试和 Desktop build。
- 完成浏览器 Renderer 截图检查，并在可用时完成 Electron 窗口验收。

## 11. 明确不做

- 本阶段不增加 OAuth/订阅协议；模板不等同于新增专用运行时适配器。
- 不改变 `ModelKey` 或 Session Journal schema。
- 不把分析观测页面并入模型页。
- 不为了模拟 Maka 而添加 ActSpace 当前不存在的环境选择器或远程账号能力。
- 不保留旧 Provider 页面作为第二套并行 UI。
