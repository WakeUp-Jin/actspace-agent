# DeepSeek 深度搜索与文档解析 — 执行计划总览

状态：待审核，尚未开始（交互模式）。当前进度：设计文档和三份子计划已写好；等用户确认下面「与确认内容的出入」两项，再从 P0 开始。

- 分支：`cursor/deepseek-deep-search-doc-demo-19d2`（从 `main` 切出，demo 已在这个分支上）。
- 设计真源：[DeepSeek 深度搜索与文档解析工具](../../../design-docs/tool-system/agent-deep-search-and-document-parsing.md)。接口事实、工具契约、界面契约、否决的方案都在那里，本计划不重复。
- 界面以 [demo](../../../design-docs/frontend/deep-search-and-document-demo.html) 为准。已选定：运行时 B（一行 + 当前动作）、展开 b（搜索词 + 引用来源）、回复里用行内链接、文档开关放位置 ②（「工具」页「多媒体」组）。
- 执行记录：执行时写到 `docs/exec-runs/20261114-deepseek-deep-search-document-parsing/`（`execution-process.md` 和 `execution-summary.md`）。
- 执行模式：交互模式。每个子计划完成后停下，给出验证结果，确认后再进入下一个。

## 目标

给 Agent 增加两个工具：

- `deep_search`：把一个问题交给 DeepSeek 的深度思考搜索，拿回带出处的要点。
- `read_document`：用 DeepSeek OCR 读 PDF、Word、PowerPoint 的文字，包括扫描件。

两个工具各有一个设置开关，默认都关。开关关着或没有 DeepSeek Key 时，工具不提供给模型，行为和今天完全一样。

## 为什么拆成三份

两个工具互不依赖，但共用三样东西：「不可用时对模型隐藏」的机制、设置字段和可用性读取、新插件的登记方式。按 `docs/PLANS_GUIDE.md`，先落共享部分，再拆两个可以单独推进、单独验收的子计划。

| 顺序 | 子计划 | 产物 | 依赖 | 用户能看到的变化 |
| --- | --- | --- | --- | --- |
| 1 | [P0 共享契约与两个空插件](p0-foundation-and-settings.md) | 工具可见性判断、两个设置字段、可用性读取、两个插件包及全部登记 | 无 | 「扩展 › 插件」的内置列表多两行；其余没有 |
| 2 | [PA 深度搜索](pa-deep-search.md) | DeepSeek 流式请求与解析、Host 接线、设置开关、`Deep Search` 工具行、Chat 模式 | P0 | 设置里多一个开关；打开后模型能用深度搜索 |
| 3 | [PB 文档解析](pb-document-parsing.md) | OCR 请求、本机类型检查、按页缓存、Host 接线、附件文件名、设置开关、输入框「+」、文档的 `Read` 行、提示词 | P0 | 设置里多一个开关；打开后模型能读文档，「+」能选文档 |

PA 和 PB 只依赖 P0。两者都会改的文件只有四个：工具行投影 `tool-card.ts`、共享的预览类型和消息块类型、两处 Host 接线文件、同一个 mock 场景文件。默认串行：P0 → PA → PB。先做 PA 是因为它不碰附件和输入框，范围更小。

## 已确认的决策（2026-11-14）

1. 深度搜索包装成独立工具，工具内部单独向 DeepSeek 发一次请求。
2. 文档解析做成独立工具，走 OCR 接口，不并进 `read_file`。
3. 开关关闭或没有 Key 时，工具不提供给模型；模型按官方 Skill 用本机 Python 提取。工具内部不做本机回退。
4. demo 的四个选项：B、b、行内链接、②。
5. 深度搜索默认关。
6. 本机 Agent / Plan 的「+」放开 PDF、Word、PPT。
7. 深度搜索进 Chat；文档解析第一版不进 Chat。
8. 第一版不设页数上限。
9. `deep_search` 和 `web_search`、`web_fetch` 并存，由模型选。
10. 内部请求只要要点和来源，先实测再定（PA.1）。
11. 40 秒没有新数据就停，总时长 120 秒，可以中止。
12. OCR 用 `text_recognition`；表格和纯文本不走 OCR。

## 与确认内容的出入（审核时定）

下面两项，计划里写的和你确认时的表述不完全一样。两项都只影响一个任务，改起来不大，请在审核时定。

### 出入 1：Chat 里深度搜索用什么形式接入

| | 内容 |
| --- | --- |
| 你确认的 | 做成现有 `web` 工具的第三种动作，Chat 仍然恰好两个工具 |
| 计划里写的 | 独立工具 `deep_search`，在 Chat、Plan、Agent 里是同一个工具；深度搜索没打开时不出现，Chat 还是原来两个工具 |
| 你看到的差别 | 没有。两种做法下 Chat 都能用深度搜索，工具行的样子相同 |

改成独立工具的理由：

- `web` 的参数结构是写死的。把 `deep` 加进动作枚举后它会一直在那里；而开关默认关，模型调了只会得到一次失败。
- 让 `web` 的结构跟着开关变行不通：同一版本的工具不允许有两份定义，而且 `web` 所在的插件是必需成员，重新注册会和正在跑的 Run 冲突。
- 独立工具在三个模式里只有一套定义、一套行投影、一套测试。

代价：现行规范里「Chat 恰好两个工具」要改成「Chat 固定两个工具，深度搜索打开时多一个 `deep_search`」。

如果坚持原表述：只替换 PA.8 这一个任务。改动是给 `web` 加 `deep` 动作和 `question` 参数、把 `web` 的定义版本升到 2、Chat 的行投影把 `web(action=deep)` 映射成 `Deep Search` 行；Plan / Agent 仍用独立的 `deep_search`。后果是深度搜索没打开时，Chat 里的模型仍然看得到 `deep` 这个动作。

### 出入 2：文档解析默认开还是关

| | 内容 |
| --- | --- |
| 你说的 | 「有 ds 的 key，就直接走 ocr」。之后第三项回复「按照你的建议来」，而那一项我只写了后果，没有给建议 |
| 计划里写的 | 默认关 |

写成默认关的理由：默认开的话，已经连接过 DeepSeek 的用户升级后，文档会在没有任何提示的情况下从本机提取变成发给 DeepSeek。现有的两个 DeepSeek 开关（搜索通道、抓取网页）都是默认关。

如果要默认开：只改 P0.2 里这一个字段的缺省值（缺省当作开），其余任务不变。

### 写计划时新定的内容

这些是细化设计时定下来的，之前没有给你看过。不同意的直接说，都是局部改动。

- **上传前在本机检查文件类型。** 不是 PDF、Word、PPT 的文件不会发给 DeepSeek。由此多出两句界面文字：「只支持 PDF、Word 和 PPT 文件。」和「DeepSeek 无法解析这个文件。」
- **demo 之外新增的失败文字。** 深度搜索：「超过 120 秒仍未完成，已停止本次深度搜索。」「DeepSeek 请求过于频繁，稍后再试。」「DeepSeek 拒绝了这个问题（内容安全）。」「深度搜索已关闭或 DeepSeek 未连接。」文档：「文件超过 100 MB，DeepSeek 不接受。」「DeepSeek 在 180 秒内没有完成解析。」「DeepSeek 账户余额不足，文档没有解析。」「文档解析已关闭或 DeepSeek 未连接。」多页识别不完整时：「第 3、13 页识别不完整，内容已截断。」「有 N 页识别不完整，内容已截断。」
- **打开开关后从下一条消息生效**，不用重启；关掉开关则从下一次模型请求起生效。
- **文档缓存的规则。** 只在内存里，总量上限 800 万字符，最新解析的一份始终保留；同一份文档的并发调用共用一次请求；调用被中止时不取消已经上传的识别（DeepSeek 那边不会停，也照常计费，所以让它跑完写进缓存）。
- **输入框「+」只在文档解析可用时变成「图片与文件」**，不可用时保持「图片」。
- **「扩展 › 插件」的内置列表多两行**：「深度搜索」（多轮搜索网页，给出带出处的结论）和「读文档」（读取 PDF、Word 和 PPT 里的文字）。不能在那里关闭，是否给模型用由设置开关决定。
- **Web / PWA 上 `Deep Search` 行第一版只有一行，不能展开。**
- **费用不进用量统计**，只在工具行上显示次数和页数。
- **CLI 和远程 Host** 用环境变量打开：`ACTSPACE_DEEPSEEK_DEEP_SEARCH=1`、`ACTSPACE_DEEPSEEK_DOCUMENT=1`，各自配合 `DEEPSEEK_API_KEY`。

## 范围

包含：两个工具的后端、Host 接线（桌面端、CLI、远程 Host）、两个设置开关、桌面端工具行、Web / PWA 上的单行显示、本机 Agent / Plan 输入框的文档入口、提示词和三个官方 Skill 的一行提示、受影响文档的同步。

不包含（第一版不做）：

- 深度搜索和 OCR 的费用进用量统计。
- 「超过多少页先问一下」的确认界面。
- Chat 模式的文档解析。
- 工具内部回退到本机提取。
- 图片 OCR。
- 子智能体读取父会话的附件。
- 远程 Host 上传时保留文件名、远程目标的输入框改动。
- Web / PWA 上 `Deep Search` 行的展开内容。
- 把解析出的全文存成会话产物，以及在文档内搜索。
- 文档解析不可用时，拖进本机 Agent / Plan 的 PDF 模型读不到（现有行为，不在这次修）。
- 把几个工具包里重复的路径复核 helper 抽成公共代码。

## 全局约束（每个子计划都适用）

- 执行前先读仓库根 `AGENTS.md`，再按子计划「必读」列表读文档。
- **审核通过前不写实现代码。**
- **Key 不进仓库。** 测试里用 `fixture-ds` 这类假值；真实接口的验证脚本放在仓库外；执行记录里不写 Key，也不贴带个人信息的原始响应。
- **自动化测试不联网。** 两个 Node 端口都接受注入的 `fetch`，测试用假的。
- **模型看到的文字用英文**（工具说明、失败消息、进度消息），**界面文字用中文**，按 `docs/design-docs/frontend/front-文案与状态表达规范.md`。
- 搜索结论、来源标题、网址、文档内容、文件名都是不可信文本：用 React text children 渲染，不用 `dangerouslySetInnerHTML`；链接只允许 `http`、`https`。
- 新颜色走主题 token；改样式前读 `docs/design-docs/frontend/front-视觉token规范.md`；浅色、深色、480px 窄宽都要验。
- 可见性判断在每次模型请求的路径上：只能读内存里的值，不取设置快照、不算哈希、不拷贝 JSON。提交前跑 `pnpm check:hot-path-reads`。
- 这几个文件已经超过 500 行，只加最少的分发代码，新逻辑放新文件：`apps/desktop/src/renderer/components/Composer.tsx`、`packages/client/client/src/live/stream-blocks.ts`、`packages/util/shared/src/session-selectors.ts`。
- 每个任务先写会失败的测试，再写实现。
- 一个任务或一个逻辑改动一个提交。文档在同一个子计划里同步，不留到最后。

## 统一验证命令

新增包、改依赖或改插件清单之后，先重新生成：

```sh
pnpm install
node scripts/generate-desktop-build-graph.mjs   # 生成各包的 tsconfig.build.json；CI 用 pnpm check:desktop-build-graph 检查
pnpm --filter @actspace/runtime build           # 重建 Harness 产物，否则测试会报缺少插件产物
pnpm generate:plugin-loader
pnpm gen:contract-matrix
```

每个子计划收尾都跑：

```sh
pnpm check:packages
pnpm check:docs
pnpm check:hot-path-reads
pnpm check:scale-tests
pnpm test:plugin-catalog
pnpm test:package-readmes
pnpm test:contract-matrix
pnpm lint
pnpm typecheck
pnpm --filter @actspace/tool-runtime test
pnpm --filter @actspace/agent test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/tool-deep-search test
pnpm --filter @actspace/tool-document test
pnpm --filter @actspace/agent-host test
pnpm --filter @actspace/desktop test
```

PA、PB 另外跑：

```sh
pnpm --filter @actspace/shared test
pnpm --filter @actspace/client test
pnpm --filter @actspace/web test
pnpm --filter @actspace/prompt test
pnpm --filter @actspace/official-skills test
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:renderer-bridge
pnpm check:ipc-channels
```

全部完成后再跑一次 `pnpm run ci` 和 `pnpm build`。

开始 P0 之前先记一次基线：在没有改动的分支上跑上面的测试命令，把已有的失败记进执行过程，之后只对比新增的失败。

## 真实接口验证

三处需要真实的 DeepSeek Key：PA.1（要点提示词和引用标记）、PA 验收、PB 验收。

- Key 从 Cursor Dashboard › Cloud Agents › Secrets 注入，名字是 `DEEPSEEK_API_KEY`。现在的执行环境里没有这个变量。
- 验证脚本放在仓库外的临时目录，只从环境变量读 Key，不写进任何文件。
- 没有 Key 时不要卡住：按子计划里写的保守默认值实现，在执行摘要里把这一项标成「未验证」，并在汇报里写明。
- 真实调用会产生费用：深度搜索一次约 ¥0.03 到 ¥0.08，OCR 每页 ¥0.0015。三处验证加起来预计不到 ¥2。

## 风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 新增两个 Host 端口会改变 Host 契约摘要 | 已保存的 Harness 选择提示需要重启一次；未改动过的内置组合自动升级 | P0.5 跑现有的升级测试；P0 收尾时用旧数据目录启动一次真实应用确认 |
| 可见性判断写错 | 工具对模型消失，或必需插件因工具「不完整」让 Run 启动失败 | 只给两个可选插件用；判断抛错按不可见；P0.1 的测试覆盖必需成员和可选成员两种情况 |
| DeepSeek 接口刚发布，字段可能调整 | 解析失败 | 对未知字段宽容；缺少引用或步骤信息时降级成没有出处的结论；服务端错误原样带出 |
| 模型反复调用 `deep_search` | 费用高于预期 | 默认关；工具说明里写明耗时、计费和适用场景；单次上限 120 秒。第一版不限制每个 Run 的调用次数，验收时观察，有问题再加 |
| 文档被发给 DeepSeek | 隐私 | 默认关；开关说明写明去向和价格；本机先检查文件类型；工作区外的路径要审批 |
| 搜索结论或文档里有诱导模型的内容 | 提示词注入 | 和现有网页工具同级处理：不可信输入，不扩展权限 |
| 大文件一次读进内存 | 100 MiB 的文件上传时内存峰值约 200 MiB | 先看大小再读；超过上限直接拒绝；写进已知限制 |
| 开关切换改变工具列表 | 下一次请求的提示词缓存失效一次 | 已知代价，写进设计文档 |
| PPT、PPTX 和老格式 DOC、PPT 没实测 | 可能读不了 | PB 验收用真实文件测；测不过就从支持的扩展名里去掉，并改文案 |
| 执行环境没有 Key | PA.1 和两处验收做不了 | 见上一节 |
| 三个已超过 500 行的文件继续变长 | 违反前端文件拆分约定 | 新逻辑放新文件，原文件只加分发 |

## 回退

- **用户侧**：关掉对应的设置开关。工具从下一次模型请求起消失，不需要重启，也不需要回退代码。
- **PA、PB**：各自回退自己的提交即可。P0 留在仓库里无害，Host 不给端口时两个插件什么都不注册。
- **P0**：回退提交。两个设置字段在旧版本里会被设置清洗丢掉，不需要迁移。Host 契约摘要会变回去，已保存的 Harness 选择再提示一次重启。

## 文档同步清单

| 文档 | 改什么 | 子计划 |
| --- | --- | --- |
| `packages/README.md`、`packages/web/README.md`、`packages/core/README.md` | 能力目录表、web 目录的包表、可选共享服务那句话 | P0 |
| `packages/document/README.md`、两个新包各自的 `README.md` | 新建 | P0 |
| `docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md` | 包表加两行；「缺授予时注册但报错」那段补上隐藏机制；信任的授权范围 | P0、PB |
| `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md` | 重新生成 | P0 |
| `docs/design-docs/tool-system/agent-web-tools.md` | 「不通过额外 LLM 总结网页」「凭据不会改变 schema 注册」两句；新增深度搜索一节；环境变量 | PA |
| `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md` | 新增 `Deep Search` 行和文档 `Read` 行两节 | PA、PB |
| `docs/design-docs/agent-runtime/agent-forms-and-modes.md` | Chat 工具数量的四处表述 | PA |
| `docs/design-docs/frontend/front-中间消息区规范.md` | 「工具行」一节加两种行 | PA、PB |
| `docs/design-docs/frontend/front-设置页规范.md` | 第 6 节加深度搜索开关，第 7 节加文档解析开关 | PA、PB |
| `docs/design-docs/frontend/front-聊天输入框规范.md` | 「+」面板入口和「附件」一节 | PB |
| `docs/design-docs/tool-system/agent-script-execution.md` | Office / PDF 提取那几行 | PB |
| `docs/design-docs/execution-safety/agent-tool-permission-model.md` | 授权范围表加 `read_document` | PB |
| `docs/SECURITY.md` | 「不依赖服务商原生联网搜索」「不写 provider tool result 原文」两句 | PA、PB |
| `docs/FRONTEND_VERIFICATION.md` | mock 场景表加一行 | PA |
| 设计文档本身 | 实现的那一半改写成当前事实；全部完成后去掉标题里的「未实现」 | PA、PB |
| `docs/design-docs/frontend/README.md` | demo 清单：功能实现并在 Electron 里复验后删除 demo | 收尾 |
| `docs/histories/` | 每个子计划记一条 | P0、PA、PB |

## 进度

- [x] 接口实测、前端 demo、方向选定（2026-11-14）。
- [x] 设计文档和执行计划（2026-11-14）。
- [ ] 审核：确认「与确认内容的出入」两项。
- [ ] P0：共享契约与两个空插件。
- [ ] PA：深度搜索。
- [ ] PB：文档解析。
- [ ] 收尾：真实应用验收、执行摘要、history、设计文档改成当前事实、删除 demo、计划移入 `completed/`。

## 决策记录

写计划时定下的实现决策。理由和否决的方案见设计文档第 12 节。

| 日期 | 决策 |
| --- | --- |
| 2026-11-14 | 「不可用时隐藏」用工具登记上的可见性判断实现，不动态注册、注销工具 |
| 2026-11-14 | 两个工具各自是可选的 Harness 插件，联网实现由 Host 端口构造；Key 每次调用时读取 |
| 2026-11-14 | 可用性读取走专门的 O(1) 入口，不经过设置快照 |
| 2026-11-14 | `read_document` 复用 `Read` 行，不新增行的种类；`Deep Search` 是新的一种行，桌面端单独一个组件 |
| 2026-11-14 | 失败时工具返回失败码和英文消息，界面按失败码显示中文 |
| 2026-11-14 | 文档上传前在本机检查大小和文件类型 |
| 2026-11-14 | 文档缓存放在 Host 端口的内存里，按页存；附件每次先过归属检查再查缓存 |
| 2026-11-14 | `read_document` 的授权范围独立于 `read_file` |
| 2026-11-14 | 输入框是否显示文档入口，跟着设置变更通知刷新，不为 Key 变化单独加通知 |
| 2026-11-14 | Chat 模式的接入放在 PA.8 一个任务里，P0 里 `deep_search` 先只声明 Plan、Agent，这样 P0 不受出入 1 的结论影响 |
