# llm-agent-dev Skill Bash 工具修复说明

## 背景

在 actspace-agent 设计「上下文压缩」（`docs/design-docs/model-context/agent-context-compression.md`）时，针对 bash 工具的大输出处理收敛出一套明显更优的设计。回头看 `.agents/skills/llm-agent-dev` 对 bash 的指导，**输出处理这一块太粗糙**，会把使用者带进「内存被大输出吃光」的坑。本文件沉淀该设计，作为后续统一修复 skill 源文件的依据。

当前 skill 已经讲清楚的部分（保留）：

- 多层安全检查（空命令、控制字符、Unicode 空白、危险删除路径、eval-like builtin、timeout 清洗）。
- 只读命令白名单与 git 子命令判断。
- description 的负面指引（find→Glob、grep→Grep、cat→Read）。
- 安全检查放 `check_permissions`、不混入 handler。

当前 skill 在「执行器设计 / 输出处理」上的缺陷：

1. `references/tools/bash-tool.md` 的「执行器设计」只写了「stdout/stderr 的捕获和合并」，**完全没提大输出的内存压力、截断策略、超大输出的恢复路径**。
2. `examples/bash-tool.ts` 用 `execFileAsync('bash', ['-c', command], { maxBuffer: 1024*1024 })`：
   - 全量输出**累加进内存 buffer**，输出一大就 `maxBuffer` 报错或吃光内存——这正是错误示范。
   - `renderBashResult` 只是 `stdout + stderr + exitCode` 拼接，没有任何上限、截断或落盘。
   - 一旦超 `maxBuffer` 直接抛错，模型连「输出过大」这个事实都拿不到。
3. `tool-scheduling.md` 的 OutputTruncator 把「所有工具」一视同仁地走「摘要 / 头尾截断 + 写临时文件」，没有指出 **bash 这类「全量本就该落盘、且逐字头部 + 文件指针比 LLM 摘要更可信」的工具应当走独立路径、不调摘要模型**。

## 参考设计（来自 actspace-agent）

事实来源：`docs/design-docs/model-context/agent-context-compression.md` 的「预防层 A：bash 流式落盘」。

核心结论：**bash 输出大小不可控，不能在内存变量里累加全量字符串；把内存上限调大只是把问题推后，治标不治本。正确做法是边执行边流式写盘，内存只保留有界头部缓冲。**

## 建议补充到 Skill 的设计

### 1. bash 输出走「流式落盘 + 头部截断 + 文件指针」，不调摘要模型

把 bash 从通用 OutputTruncator（LLM 摘要）路径里拆出来，理由写进 skill：

- bash 全量原文已永久落盘且可被读取工具逐字翻页，恢复成本已被文件覆盖。
- 头部通常最有用（命令回显、前段输出、报错），**逐字头部 + 文件路径**比 LLM 摘要更可信。
- 省掉每次 bash 都叫一次摘要模型的延迟与成本，也避免摘要把日志里的精确数字/路径摘错。
- LLM 摘要只服务「重跑才能恢复、且适合摘要」的工具（web、generic 等）。

### 2. 流式落盘机制（在通用 runProcess 之上扩展）

复用修复文档 `fix-llm-agent-04-skill-rg-tools-fix.md` 提出的通用 `runProcess`，给它加一个**流式落盘 sink**（bash 使用，rg 不必）：

- 执行期内存只保留一个**有界头部缓冲**（`headBufferCap`，建议 4000 字符）+ 一个总字节计数器。
- 输出 ≤ `headBufferCap`：头部缓冲即全部内容，**不创建任何文件**。
- 输出 > `headBufferCap`：从超出那一刻起**懒创建临时文件并流式写盘**。
- **磁盘安全阀** `diskCap`（建议 5MB，远大于内存阈值）：超过即停写并标记 `truncated`，防跑飞命令撑爆磁盘。`timeout` 仍生效。这是唯一的硬限制，且落在磁盘而非内存。
- 内存占用恒定 ≈ `headBufferCap`，与输出总量无关。

建议的扩展返回结构：

```ts
type RunProcessResult = {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  // 流式落盘相关
  headBuffer: string;        // 前 headBufferCap 字符
  totalBytes: number;        // 实际字节数（用于判断是否超阈值）
  outputFilePath?: string;   // 仅当超 headBufferCap 时才有
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;        // 命中 diskCap 截断
  startError?: string;
};
```

### 3. 执行后构造工具输出

bash executor / renderResult 根据 `totalBytes` 与 `headBufferCap` 决定回填内容：

- 未落盘（≤ 阈值）：直接 inline 全部内容，无截断标记。
- 已落盘（> 阈值）：工具输出 = 逐字头部 + **截断标记** + 文件路径，例如：

```text
<头部前 N 字符逐字内容>
[输出截断：显示前 4000/共 123456 字符，完整原文见 <绝对路径>，可用 read_file 读取]
```

- 「小输出落盘后再删」由「小输出根本不落盘」天然实现，无小文件残留；只有大输出文件被保留，交定时清理处理。

### 4. 临时文件位置与回读

- 落盘到应用数据目录的临时区（如 `<userData>/tmp/tool-output/<sessionId>/<turnId>-<toolCallId>-bash.txt`），不要污染 workspace。
- skill 应明确：要让模型能读回该路径，读取类工具（read_file 等）的路径边界不能被 workspace 硬框死，否则「拼路径让模型读」无法生效（见 actspace 设计「读边界放开」）。

### 5. 截断/压缩标记是硬要求

skill 应强调：任何「非完整」的工具输出回填给模型时，**必须带明确标记说明内容被截断/压缩、以及如何取完整原文**，避免模型误把截断结果当全量。

## 需要修改的 Skill 源文件

Skill 源文件仓库：

```txt
/Users/wakeup-jin/Desktop/code-project/side-project/agent-harness-dev
```

建议修改：

- `references/tools/bash-tool.md`：「执行器设计」节扩写为「输出处理与内存安全」，加入流式落盘、头部缓冲、磁盘上限、截断标记、回读路径，并说明 bash 不走 LLM 摘要。
- `references/tools/tool-scheduling.md`：OutputTruncator 节区分「LLM 摘要类工具」与「bash 这类确定性头部 + 文件指针工具」。
- `references/context/mgmt-compression.md`：工具输出裁剪一节补「流式落盘 vs 内存累加」的反面教材与正解。
- `examples/bash-tool.ts`：把 `execFileAsync({ maxBuffer })` 改成基于流式 `runProcess` sink 的实现（headBuffer + 懒落盘 + diskCap），`renderBashResult` 改为按阈值输出头部 + 截断标记 + 路径。
- 复用 `examples/run-process.ts`（`fix-llm-agent-04-skill-rg-tools-fix.md` 已提出新增）：增加可选 `outputFile` / `headBufferCap` / `diskCap` 流式 sink。

## 验收标准

- `bash-tool.md` 明确：bash 输出不在内存累加全量，走流式落盘 + 头部缓冲，内存恒定 ≈ headBufferCap。
- `examples/bash-tool.ts` 不再使用 `maxBuffer` 全量缓冲；大输出懒落盘、回填头部 + 截断标记 + 路径。
- skill 明确 bash 不调 LLM 摘要，并说明原因（全量已落盘、头部 + 路径更可信、省延迟成本）。
- OutputTruncator 文档区分摘要类工具与 bash 类确定性工具两条路径。
- skill 强调截断/压缩标记是回填给模型的硬要求。

## 决策记录

- 2026-05-29：bash skill 修复**只先沉淀本修复文档**，实际 skill 源文件修补不在 actspace-agent 当前 active plan 内执行，沿用本目录既有约定（见 `README.md` / `fix-llm-agent-04-skill-rg-tools-fix.md` 决策记录），后续统一修复 skill 源码时按本文执行。
- 2026-05-29：bash 输出处理定为「流式落盘 + 头部截断 + 文件指针」，不走 LLM 摘要；摘要只服务 web/generic 等重跑恢复型工具。原因见 `docs/design-docs/model-context/agent-context-compression.md`。
