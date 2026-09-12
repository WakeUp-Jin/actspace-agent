# 执行摘要

实现与自动化验证完成，未替换本机安装包。

## 改动结果

- Bash 保持 8,000 字符内联头部与既有落盘/磁盘上限；普通文件引用在下一次请求中提供可回读路径和分页/搜索指引。
- read_file / grep 仅额外接受 Host 校验后的本 Session artifact；写入/删除权限不扩大。大于 1 MiB 的受管输出不会被普通仓库搜索大小阈值跳过。
- 历史只存引用；图片在 wire 边界读取，支持 pi-ai 直连与 legacy 的 OpenAI Completions / Responses / Anthropic 路径。
- 新失败保存具体脱敏原因；旧 failed 记录显示明确通用错误。文件丢失保留原头部并提示不可用，无需改写旧 Journal。

## 自动化证据

| 检查 | 结果 |
|---|---|
| Core Agent Loop | 13 通过；最初 2 条回归已实际红灯再转绿 |
| LLM pi-ai | 29 通过 |
| Tool Runtime | 18 通过 |
| Core Tools | 17 通过 |
| CLI | 13 通过 |
| Desktop 全量 | 99 文件、670 测试通过 |
| 最后搜索边界调整后的 Desktop 相关测试 | 16 通过 |
| Runtime 依赖闭包构建 | 通过 |
| Desktop / CLI 类型检查 | 通过 |
| renderer / Electron / CLI 构建 | 通过 |
| check:docs / git diff --check | 通过 |

`runtime-v2-output-reference-flow.test.ts` 使用真实 Bash、真实文件 store 与 Agent Loop：生成 3,000 行输出，下一次模型输入仅含头部与路径；按路径读末尾、搜索、验证跨会话拒绝。Provider 请求使用离线替身，不消耗真实凭据。

同形排查覆盖 Core 唯一 artifact→LLM 转换、pi-ai toolResult 转换、legacy 三个协议转换。Runtime 展示 DTO 原本保留 artifact-ref/MIME，无需修改。没有增加通用媒体存储系统或图片历史裁剪策略。

## 安装态验收

这些仍需在更新安装包后执行，自动化结果不代表已完成：

1. 打开包含旧大输出引用的会话并继续；应可生成后续回复，不再次出现本地图片校验失败。
2. 让 Bash 输出超过 8,000 字符，随后按返回路径 read_file 分页与 grep，确认输出末尾可恢复。
3. 使用原生支持图片的模型，分别发送用户图片和读取图片文件；并行工具结果中的图片应可被模型解释。
4. 制造可控模型失败，确认错误可见；切换会话或重启后仍能看到原因。

未执行真实 Provider 调用、Electron 安装态/截图、安装包替换或签名发布。
