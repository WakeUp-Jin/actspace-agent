# Bash 后台执行手工验收问题修复

## 用户诉求

对 E1–E4 落地结果做手工验收后反馈四个问题：

1. 模型重跑命令加管道（`bash xx.sh | sed -n '7564p'`）被拒，出现「执行失败」块。
2. bash 工具执行中没有像其他工具那样的 shimmer 高光，用户看不出命令在跑。
3. `bash_output` 的工具块只有一个空 `$ `，用户不知道执行了什么。
4. 命令转后台后落盘文件停止增长，看起来「进程没有继续执行」。

## 结论与修复

### 问题 4（真 bug，最严重）：转后台后落盘文件停写

- 根因在 `startProcessSink.handleChunk`：只有「溢出 headBuffer 的部分」才写盘。转后台时 `ensureOutputFile()` 创建文件并刷入当时的 headBuffer 快照，但之后的输出仍先进 headBuffer——headBuffer 未满则一个字节都不落盘（文件冻结）；满了之后只写溢出段，文件中间留下永久空洞。进程本身一直在跑，只是输出丢了。
- 修复：`fileCreated` 为真后，每个 chunk **全量续写**文件；未创建文件时维持原「首次溢出创建 + 刷 headBuffer + 写溢出」路径，前台语义不变。
- 为什么单测没拦住：`bash-background.test.ts` 的断言关键字（`first-chunk`、`l3`、`started` 等）恰好是命令文本的子串，而 `bash_output`/通知文本都会回显命令（`Task xx (printf first-chunk; sleep 30)`），断言被命令回显假阳性满足。已把所有测试命令改为 `printf '%s' 格式串` 形态（输出不是命令子串），并在 `subprocess.test.ts` 新增两个回归测试（ensureOutputFile 后续写、headBuffer 补满期不留空洞）。

### 问题 2：执行中无高光

- `BashRunBlock` 之前对 `status === "running"` 只显示静态文字。现复用 `toolLogStyles` 的 `tool-log-text-running` + `data-shimmer-text` shimmer 机制：前台执行中、或后台任务仍在 running 时标题走高光；后台任务到终态（bash_task_update 覆写 backgroundStatus）即停。

### 问题 3：`bash_output` 块显示空命令

- `bash_output`/`bash_kill` 的 previewKind 是 `bash`，但参数里没有 `command`，preview 的 `$` 后为空。`bridge.createToolUiPreview` 现接收 toolName，为这两个工具合成伪命令行（`bash_output <taskId> --tail N` / `bash_kill <taskId>`）。

### 问题 1：管道命令被拒（预期行为 + 引导补强）

- 权限层 `UNSUPPORTED_SHELL_SYNTAX_RE` 硬拒 `| < > ` + "` $ ( ) { }`"（无法安全分段分类，见 allowlist 设计）。失败块本身是权限层正确工作。
- 但模型不该重跑命令加管道——正确姿势是读落盘文件。已在 bash 工具描述中显式写明「权限层拒绝管道/重定向/命令替换/子 shell；要过滤输出请 read_file/grep 落盘文件」，减少模型踩这一拒绝路径。

### 追加：任务通知在前端裸露原始 XML

- 用户复验时发现「后台任务通知」块直接显示了注入模型的 `<task_notification>` 原始 XML。
- 机制本身正确（模型需要结构化 XML），问题在展示层：`session-selectors.ts` 此前对 `source: "task_notification"` 的消息只是原样透传 content。
- 处理：先做了「解析成一行人话」的版本，用户确认后改为**用户侧完全不渲染**——selectors 对 `source: "task_notification"` 返回空块。任务状态用户已经能从 bash 块徽标（`bash_task_update` 实时覆写）看到，输出在落盘文件里，通知块纯属重复信息。

## 验证

- `subprocess.test.ts` 14 例（含 2 个新回归）、`bash-background.test.ts` 13 例（去假阳性后）、`bash.test.ts` 20 例、`bridge.test.ts` 24 例（含 bash_output 伪命令 1 例新增）、`bash-run-block-tooltip.test.tsx` 6 例（含 shimmer 2 例新增）全绿；agent-core 全量 669 例通过。
- desktop typecheck 的 `enabledSkills` 报错来自工作区内另一批未完成的 Kairos 改动，与本次无关。

## 关键文件

- `packages/agent-core/src/tools/subprocess/run-process.ts`（sink 写盘修复）
- `packages/agent-core/src/engine/bridge.ts`（bash_output/bash_kill 伪命令 preview）
- `packages/agent-core/src/tools/tools/bash/definition.ts`（管道限制说明）
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`（shimmer 高光）
- 测试：`subprocess.test.ts`、`bash-background.test.ts`、`bridge.test.ts`、`bash-run-block-tooltip.test.tsx`
