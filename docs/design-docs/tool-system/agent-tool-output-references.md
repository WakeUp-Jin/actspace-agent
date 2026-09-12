# 工具输出、文件引用与图片输入

当前 v2 契约；历史 Bash 设计的核心原则继续有效：输出有界、完整结果可回读，超过内联阈值不等于执行失败。

## Bash 输出

`node-bash-ports.ts` 执行期间持续写输出文件，内存头部上限为 8,000 字符；磁盘上限继续由 Bash runner 控制。短输出直接内联，长输出保留头部与总长度，并通过 `createArtifact` 保存完整 `text/plain` 文件。磁盘安全阀命中时明确标记截断，不能称其为无限完整输出。

工具 Journal 保存 `text + artifact`，artifact 包含 ID、MIME、大小、SHA-256，所有权由 Host store 记录。Agent Loop 在每次请求组装时通过 Host 的 `resolveArtifact(sessionId, artifactId)` 解析本会话文件，形成完整路径与 `read_file offset/limit`、`grep path/pattern` 引导，不自动展开全文。解析结果也进入本次 `request/context`，历史工具事实保持不变。

这使既有 v2 Journal 的大输出引用可以直接恢复，不需要重写旧日志。文件被删除、损坏或不属于该 Session 时返回明确的不可用提示，不把文件引用误当成图片，也不自动重跑可能有副作用的命令。

读取类工具对工作区文件维持原规则；仅对本 Session 拥有、通过 Host metadata/digest/realpath 校验的 artifact 文件增加精确读取与搜索例外。写入、删除和目录遍历不因此获得工作区外权限。Desktop 与 CLI 使用相同解析接口，ephemeral CLI 的文件生命周期仍随运行结束。

## 三种表示

| 层 | 普通文件 | 图片 |
|---|---|---|
| Journal / Surface | 带 MIME 的 artifact 引用 | 带 MIME 的 artifact 引用 |
| LLM logical request / snapshot | 元信息、可读路径与检索提示 | `image` block，只有 artifactId、mimeType、alt |
| Provider wire | 有界文本，不自动读全文 | 此时才读取字节并编码为协议要求的图片内容 |

`artifact` 是存储引用，不是媒体类型。Core 只有在 MIME 是 `image/*` 时才生成逻辑 image block。Provider 的支持格式、文件签名和请求体上限仍由图片适配器校验。

## 工具图片与协议

- OpenAI Chat Completions / Responses：保留原工具文本结果与 call ID，在同一批所有 tool results 之后追加 user visual observation。不能在并行调用的结果中间插入 user 消息。
- Anthropic：保留 `tool_result` 内的结构化 text + image。
- pi-ai 直连与 legacy proxy 两条适配路径遵循同一角色归一化规则；字节只在 wire adapter 读取。
- text-only 模型得到明确“无法看图”的元信息与按需 `inspect_image` 提示，不触发隐式视觉模型调用。
- 图片历史的选择/压缩仍属于 Context 策略；本修复不引入自动删除图片历史或额外图片预算。

## 失败事实

失败回合的 `turn/end` 可携带脱敏、有界的 `failure`。运行时通知与 durable renderer projection 消费同一原因；重新加载 Session 后仍可显示错误。旧 `reason=failed` 没有 failure 时显示通用失败提示，不猜测原始原因。错误不是模型文本，不加入 Surface。

## 验证入口

- Core `output-references.test.ts`：普通文件不变图片、失败原因脱敏并持久化。
- Desktop `runtime-v2-output-reference-flow.test.ts`：真实大 Bash 输出、下一次请求路径、末尾分页/搜索、跨会话拒绝。
- pi-ai `tool-images.test.ts`：并行调用顺序、三个协议、两条适配路径与 text-only 行为。
- Desktop `runtime-v2-fixed-renderer-projection.test.ts`：新旧失败记录恢复为错误块。
