# 把一份 bundle 拆成多份时，沿服务接缝拆，并看产物而不是输入图判断模块身份风险

默认 Harness 原来是一份代码分割的多条目闭包，拆成「内核 + 每个工具插件」时，真正的风险不是体积，而是**同一个模块被打进两份
bundle 后变成两个不同的模块实例**：`instanceof SomeError` 判空、`Symbol()` 对不上、模块级 `WeakMap` / `WeakSet` 分裂成两张表。
结论：拆分边界只能落在双方只经服务对象（`ctx.get` / `ctx.provide`）交互的接缝上；要判断某条边界安不安全，看拆出来的产物里
实际保留了什么，不要看打包器的输入模块图。

关联：[后端插件包解耦 P2 history](../../histories/2026-11/20261109-1600-harness-plugin-decoupling-p2.md)。

## 为什么会这样

- 打包器会把一个包的所有被引用模块都列进 metafile 的 `inputs`，哪怕最后只留下一个纯函数。用「输入重叠」判断，14 个工具插件
  每个都与内核重叠二十多个 `tool-runtime` / `agent` / `subagent` 模块，看起来全都不能拆——这是假阳性。
- 摇树后的输出才是运行时真正存在的代码。工具插件 bundle 里剩下的只有 `isPathWithin`、`canonicalizeFileResource` 这类纯函数、
  几个常量，以及因 `extends Service` 被保守保留但从未实例化的类；真正带身份语义的东西（`ToolRuntimeError`、`LlmRuntimeError`、
  context-engine 的可信表面 `WeakSet`）只在内核条目之间共享。
- 反例：如果把 `tools-runtime` 与 `filesystem-read` 分到两份 bundle，而后者又 `throw new ToolRuntimeError(...)`，内核里的
  `error instanceof ToolRuntimeError` 会变 false，错误被当成未知异常；这种故障 `tsc` 和源码测试都发现不了，只在打包后的装配测试暴露。

## 稳定的做法

1. 先定边界原则：一侧对另一侧只通过服务对象、事件和 JSON 数据交互，不共享类实例与 Symbol。默认 Harness 里工具插件对内核
   恰好满足，内核条目之间不满足，所以是「内核 + 工具插件」两层，而不是逐条目。
2. 对每个候选边界做一次产物探针（可丢弃脚本放 `/tmp`）：各自 `bundle: true, splitting: false` 打一份，然后在输出里 grep
   `instanceof [A-Z]\w*Error`、`Symbol(`、`new WeakMap|new WeakSet`、`^var \w+ = class`；命中的每一项追问「两侧是否都会
   实例化 / 抛出 / 用作键」。只有定义没有实例化（如被保守保留的 `AgentRegistryService`）不算风险。
3. 边界确定后把原则写进构建脚本注释与设计文档，再在真实产物上用装配测试守住（替换其中一份产物，另一份不变、兼容性检查无诊断）。
4. 同一个谓词同时决定「拆成独立产物」和「进入形态成员」（`isHarnessToolPlugin`），避免两份清单漂移。
