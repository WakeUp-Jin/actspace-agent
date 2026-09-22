# LLM 请求配置冻结与 Retry Lease

这次 LLM Core Pi 改造提炼出一个可迁移的 Agent 后端模式：把“选择和物化请求配置”与“执行一次 stream”分开，并让它们共享一个有生命周期的 registration lease。这样设置变更可以影响下一次请求，却不会改变已经开始的请求或它的重试。

## 为什么不能在每次 dispatch 重新读设置

模型、endpoint、proxy、pricing 和 capability 是一次请求的事实。若首次生成失败后重新读取当前设置，用户在运行中切换模型就会让同一轮请求变成另一条请求；若旧 generation 正在 drain，重试还可能落到已经不再服务的注册上。

prepare 阶段先取得当前 generation 的 lease，再解析模型事实和连接配置，最后返回绑定这些事实的 adapter call。第一次真正的 await 之前完成 lease 获取，避免资源在异步准备期间被替换。retry 使用同一个 prepared call 和 lease；下一轮新请求才取得新的 generation。

## Before / After

```ts
// 容易产生漂移：每次 attempt 都重新读取设置
async function dispatchWithRetry(input) {
  return adapter.dispatch(await resolveCurrentSettings(input));
}
```

```ts
// 请求事实只物化一次；retry 只复用当前 registration
const prepared = await service.prepare(request);
try {
  return await prepared.dispatch();
} catch (error) {
  const retry = await service.prepareCaptured(request, prepared.preparedAdapterCall);
  return await retry.dispatch();
} finally {
  prepared.release();
}
```

## 核心要点

- lease 表示“这次调用仍可使用哪一代资源”，不是全局锁。
- 配置快照与秘密解析分开：endpoint 和 model facts 在 prepare 固定，API key 可在 dispatch 时按 credential resolver 解析。
- replacement 只让新请求使用新 generation；已有 retry scope 可以在 draining 状态完成收尾。
- adapter 的公共契约只暴露 ActSpace DTO，不把第三方 SDK 类型扩散到 service、Session 或 Host 边界。

## 常见陷阱

1. 在 `await` 之后才取得 lease，资源可能已经被替换，导致 prepared call 指向失效 generation。
2. retry 重新调用模型选择器，把设置变化误当成同一请求的重试。
3. 为了避免旧资源泄漏，直接禁止 draining registration；这会让合法的已开始请求无法完成。
4. 把 credential 一起永久复制进配置快照，既扩大秘密暴露面，也阻止同一连接安全轮换 key。

## 自检问题

1. 用户在首次请求返回 429 前切换模型，重试应该发送哪个 model，为什么？
2. 哪些字段必须在 prepare 固定，哪些字段可以在 dispatch 时解析？
3. registration replacement 后，为什么 retry lease 可以允许 draining，而新请求不能？

对应变更记录：`docs/histories/2026-09/20260922-1256-llm-core-pi-plan.md`。
