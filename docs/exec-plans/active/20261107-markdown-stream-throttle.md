# 流式 Markdown：尾部解析降频与解析器常驻

## 目标

按设计规范 [front-流式Markdown解析降频规范.md](../../design-docs/frontend/front-流式Markdown解析降频规范.md) 实施：

- 流式回复的尾部最多每 100ms 解析一次；遇到换行、写完、内容不是追加时立即解析；
- 两次解析之间，新放出的字以原样尾巴逐帧显示；
- 处理器按管线组合常驻；
- `hasVisibleText` 不再整串替换。

最终显示与直接渲染整条回复完全一致。

## 范围

**包含：** 规范 §3 的全部条目。

**不包含：**
- 增量解析器；
- worker；
- 尾部补全；
- 代码块增量高亮。

## 背景

- 规范：[聊天区 Markdown 渲染规范](../../design-docs/frontend/front-聊天区Markdown渲染规范.md) §2、§5、§6。
- 代码在 `apps/desktop/src/renderer/components/messages/` 下：
  - `MarkdownProse.tsx`
  - `markdown-blocks.ts`
  - `markdown/MarkdownBlocks.tsx`
  - `markdown/pipeline.ts`
  - `markdown/rehype-stream-tail.ts`
  - `markdown/smooth-text.ts`
  - `markdown/CodeBlock.tsx`
- `packages/util/shared/src/visible-text.ts`
- 模拟脚本：`tmp/md-throttle-sim.mjs`
- 证据：`tmp/heap/run7/renderer-*.heapprofile`

## 任务

### T1 `hasVisibleText`（主智能体先做，涉及 shared 构建）

- 改为用非全局正则做 `test`。
- 补测试：零宽字符、空白、普通文字三类。

### T2 处理器常驻

- 新增 `markdown/processor.ts`：
  - 按管线 key 缓存已 `freeze()` 的 unified 处理器；
  - 提供 `renderMarkdown(source, pipeline, components)`，内部依次是 `parse`、`runSync`、raw 节点和 URL 过滤，最后 `toJsxRuntime`。
  - 对照 react-markdown 10.1.0 的 `lib/index.js`。
- `MarkdownBlockView` 和 `FootnoteSection` 改用它。
- `markdown-blocks.ts` 的 `gfm()` 和 `gfmFromMarkdown()` 提到模块级。
- `apps/desktop/package.json`：
  - 直接声明 `unified`、`remark-parse`、`remark-rehype`、`hast-util-to-jsx-runtime`、`html-url-attributes`、`vfile`，版本与当前锁定的一致；
  - react-markdown 不再引用就删除。
- 测试：连续多次渲染只创建一次处理器。

### T3 降频解析与原样尾巴

- `MarkdownProse.tsx`：
  - 维护 `parsedLength` 和上次推进时间；
  - 按规范 §3.1 的四条规则推进；
  - 计时用 `performance.now()`，测试里用假时钟；
  - `splitMarkdownBlocks` 只吃 `smooth.text.slice(0, parsedLength)`。
- 尾巴组件按规范 §3.2：
  - 普通块接在最后一块后面，渲染为行内 span；
  - 没闭合的代码块接进代码区；
  - 末尾渐显和光标由尾巴负责，已解析部分只做剩余字数的渐显，需要给 `rehypeStreamTail` 一个「已由尾巴承担的字数」参数，或拆成两个插件变体。
- §5 的稳定性硬约束保持成立。

### T4 测试

- 等价：mock 网络批次逐帧回放，最终 `innerHTML` 等于一次性渲染。覆盖两份回复：
  - `MARKDOWN_SHOWCASE_REPLY`；
  - run7 最长回复，保存为 fixture。
- 降频：最后一块管线执行次数不超过现在的 1/4。
- 尾巴：
  - 逐帧可见；
  - 光标在尾巴后面；
  - 换行时同帧解析。
- 代码块：没闭合时尾巴在代码区内，高度只增不减。
- 现有 `chat-markdown-*`、`markdown-blocks`、`markdown-prose` 全部通过。

### T5 文档与验证

- 规范状态改为「已实现」；
- 聊天区 Markdown 渲染规范 §2、§6 同步；
- 前端 README 加索引；
- 历史记录；
- 运行 `pnpm --filter @actspace/desktop typecheck` 和 `pnpm --filter @actspace/desktop test`。

## 风险

| 风险 | 应对 |
|---|---|
| 自己维护的处理器与 react-markdown 行为不一致 | 现有 `chat-markdown-*` 测试全部覆盖，并在等价测试里比较 DOM |
| 尾巴和已解析部分的交界处版面跳动 | 稳定性测试；Electron 由用户确认观感 |
| 格式生效晚 100ms | 规范已写明，用户已接受 |

## 验收

- 规范 §5 全部条目；
- 实机观感由用户在 Electron 里确认。

## 执行记录（2026-11-07）

- T1–T5 已实现，自动化检查通过（未提交）。下一步由用户在 Electron 里确认流式观感，并用 monitor 重跑 run7 的问法对比渲染进程分配（规范 §5 最后一条）。
- **T2 处理器常驻：** `markdown/processor.ts` 用 WeakMap 按管线对象缓存已 `freeze()` 的处理器，`renderMarkdown` 只做 parse → runSync → raw 转文本 + URL 过滤 → `toJsxRuntime`。react-markdown 没有删：轨迹视图 `trajectory/shared.tsx` 仍在用，聊天区只用它的 `defaultUrlTransform` 和类型。`chat-markdown-render-count` / `chat-markdown-lazy` 两个测试改为包一层 `renderMarkdown` 计数。
- **T3 推进规则比规范草案多两条：**
  - 平滑输出追平网络时立即解析：网络停顿期间原样尾巴不一直挂着。
  - 还没定类型的行（空行、只有 `-`、`##`、`>`、`1.` 等块标记的行）连同前面的换行先不放出，等这一行有了内容再一起显示和解析。只按换行触发时，`##` 会作为原样文字接在上一段末尾；按「停在标记行」触发又会每个标记字符解析一次（展示回复只降到 1/3.7）。
  - 没闭合的代码块里换行不触发解析（每行都是代码），只有出现围栏行才触发。
- **T3 尾巴的实现：** `rehypeStreamTail` 改为只放 `act-stream-tail`（尾巴位置）和 `act-fade`（已解析部分最后 36 个字，带「后面还有几个字」）两种占位元素，渐显 span 和光标由 `markdown/StreamTail.tsx` 的组件按 `StreamTailContext` 生成。块按源码 memo，两次解析之间只有这几个组件重新渲染。尾巴位置跳过隐藏的脚注区和「↩」，不进加粗和链接；代码块里接在 `<code>` 最后一行的行尾，尾巴结尾的换行去掉，与下次解析的行数一致（否则代码块会回缩一行）。
- **T4 测试：** `chat-markdown-throttle.test.tsx`，假时钟 + 手动 rAF + `networkBatches` 逐帧回放。
  - 等价：展示回复和 run7 最长回复（`test/fixtures/markdown-stream-real-reply.md`），回放结束的 `innerHTML` 与一次性渲染相同。
  - 降频：块的解析渲染次数，展示回复 203 / 835（约 1/4.1），run7 回复 345 / 1670（约 1/4.8）。对照组把每帧时钟拨 1 秒，相当于每帧解析。
  - 尾巴逐帧可见、光标在尾巴后面、尾巴里没有换行和行首块标记；代码块尾巴在 `<code>` 里、行数只增不减；处理器 100 次渲染只建一次。
  - `chat-markdown-stream.test.tsx` 的 `rehypeStreamTail` 单测改为跑插件后用同一套组件渲染再查 DOM，新增尾巴承担渐显、尾巴超过 36 字、行内元素后、代码块、脚注区、分隔线六种情况。
- **变异检查：** 去掉「未定类型的行先不放出」→ 展示回复降频断言失败；去掉换行触发 → 尾巴无换行断言失败；去掉代码尾巴结尾换行的处理 → 代码块单测失败。
- **检查：** `pnpm --filter @actspace/desktop typecheck` 通过；desktop 全量 2767 个测试通过（回放测试单个 1–2 秒，全量并行时给了 30 秒超时）。
