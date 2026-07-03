# Tool failure output must stay diagnostic

来源：`docs/histories/2026-07/20260703-1042-bash-failure-output.md`

## 是什么

工具调用失败时，`error` 字段通常只适合表达状态；真正可诊断的信息可能在结构化 `data`、`stdout`、`stderr` 或工具自定义的 rendered output 里。

对 Bash、编译器、测试 runner、包管理器这类工具来说，失败输出不是附属信息，而是 Agent 下一轮推理的主要输入。

## 为什么需要

如果工具系统在 `success: false` 后直接短路，只把 `error` 返回给模型和 UI，Agent 会看到类似：

```text
Bash command exited with code 2
```

但丢掉真正关键的内容：

```text
src/index.ts(1,1): error TS1000: boom
```

这会造成两个问题：

- Agent Loop 虽然继续执行了，但模型没有足够信息修复问题，只能反复猜命令或换写法。
- UI 和日志只显示 `Tool execution failed`，排障者不知道失败发生在业务代码、依赖安装、命令语法还是工具自身。

## 怎么做

失败结果也应该走统一输出管道：

1. 工具 handler 返回结构化失败结果，保留原始 `data` 和 `error`。
2. scheduler 在 `renderResult` 存在时先渲染输出，即使 `success === false`。
3. model output / UI preview / run log 都优先使用 rendered string。
4. 只有没有 rendered `data` 时，才降级到 `error`。

示意：

```ts
const rendered = tool.renderResult?.(result);
if (!result.success) {
  return rendered !== undefined ? { ...result, data: rendered } : result;
}
```

## 核心要点

- `error` 适合做状态摘要，不适合替代完整诊断输出。
- `success: false` 不等于输出不可用；很多命令失败时输出价值最高。
- UI、模型上下文、持久化日志最好共享同一套输出选择规则，避免某一层又退回通用失败文案。
- 回归测试要覆盖模型可见内容和排障入口，不只测工具 handler 自己。
