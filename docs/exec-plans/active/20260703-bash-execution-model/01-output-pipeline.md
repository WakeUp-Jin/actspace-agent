# Plan 01：E1 输出管道收口

## 目标

bash 输出管道的回填文本达到设计文档「输出永远有界 + 全量可检索」的要求：错误语义三分类清晰、大输出回填自带检索引导、工具描述与实际行为一致。不改变执行模型（仍是同步 + 超时杀进程，E3 才切换）。

## 范围

- 包含：`render-result.ts` 回填文本、`executor.ts` 错误分类、`definition.ts` 工具描述、对应测试。
- 不包含：后台运行、blockMs、通知、沙盒（后续计划）；`run-process.ts` 的 sink 机制本身（已达标，不动）。

## 背景

- 相关文档：`docs/design-docs/agent-bash工具设计文档.md`「工具契约」「模型引导」节。
- 相关代码路径：
  - `packages/agent-core/src/tools/tools/bash/executor.ts`（错误分支在 73–105 行）
  - `packages/agent-core/src/tools/tools/bash/render-result.ts`
  - `packages/agent-core/src/tools/tools/bash/definition.ts`
  - 测试：`packages/agent-core/src/tools/test/bash.test.ts`
- 已知约束：`ToolResult.data` 经 `renderResult` 转为回填文本（见 `internal-tools.ts`）；`outputRef` 已在落盘时填 file ref，不要动。

## 风险

- 风险：改回填文本措辞可能破坏依赖字符串断言的既有测试。
- 缓解方式：先跑 `pnpm --filter @actspace/agent-core test` 摸底，改动后逐一修正断言而不是放宽断言。

## 任务

1. **错误语义三分类**（`executor.ts`）：
   - 启动失败（`proc.startError`）：现状返回 `success: false` 无 `data`，保持，但错误文案补充 cwd 与命令，便于模型自查路径错误。
   - 命令失败（`exitCode !== 0`）：保持 `success: false` + `data`。
   - 截断（`truncated` / `outputTruncated`）：**不是失败**，不得因截断置 `success: false`（现状正确，补测试钉住）。
2. **检索引导**（`render-result.ts`）：`outputTruncated` 分支的提示文本改为明确两条路径——`read_file` 带 offset/limit 分段读、`grep` 带 path 检索落盘文件；并明确禁止「重跑命令加 `| head`」。验证：新增断言检查提示文本包含 `read_file` 与 `grep` 字样。
3. **工具描述同步**（`definition.ts`）：description 增加大输出行为说明（超过阈值只回填头部 + 落盘路径，引导用 read_file/grep 检索），与 `render-result.ts` 的引导保持一致口径。
4. **测试**（`bash.test.ts` 追加用例）：
   - 大输出（> inlineThreshold）：回填含检索引导文本、`stdoutFilePath` 存在、`success: true`。
   - 启动失败（不存在的 cwd 或命令）：错误文案含 cwd/命令。
   - exit code 非 0 且大输出：`success: false` 且仍有落盘路径。

## 验证方式

- 命令：`pnpm --filter @actspace/agent-core test -- bash`（vitest 过滤）；`pnpm typecheck`。
- 手工检查：无（纯后端文本行为，测试覆盖足够）。

## 进度记录

- [x] 任务 1 错误三分类（startError 文案带 command/cwd；截断不置败由测试钉住）
- [x] 任务 2 检索引导（render-result 指明 read_file offset/limit + grep，禁止重跑加 head）
- [x] 任务 3 工具描述（definition 增加大输出行为说明）
- [x] 任务 4 测试补齐并全绿（bash.test.ts 17 用例通过，新增 3 例）

## 决策记录

- 2026-07-03：截断不算失败——截断是输出管道的正常工作状态，失败语义只保留给「命令本身失败」和「起不来」。
