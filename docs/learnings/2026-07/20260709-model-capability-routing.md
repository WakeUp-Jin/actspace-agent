# 模型能力路由：不要用隐藏工具补齐主模型

> 提炼自 history `2026-07/20260709-2145-model-input-vision-routing.md`。

## 是什么

Agent 需要决定某个输入能不能交给当前模型时，优先用模型元数据做显式路由，例如 `input: ["text"]` 或 `input: ["text", "image"]`。工具层不应该偷偷调用另一个模型来补齐主模型没有的能力。

## 为什么需要

隐藏 fallback 看起来体验顺滑，但会制造三个问题：

1. **能力边界变模糊**：用户以为 DeepSeek 看懂了图片，实际是 Kimi 在背后代看。
2. **配置路径变复杂**：主模型 key、helper 模型 key、工具门控和 UI 状态容易互相不一致。
3. **未来迁移困难**：当 DeepSeek 以后支持图片时，系统不知道该关掉 helper、改工具，还是改 prompt。

显式能力路由把判断点收束到模型定义：模型支持图片，就传 image content part；模型不支持图片，就只传附件元信息，并明确提示不要做视觉判断。

## 怎么用

Before：把图片理解包装成工具。

```ts
if (isDeepSeek && hasKimiKey) {
  tools.register(analyzeMediaTool);
}
```

After：让模型注册表成为事实来源。

```ts
const supportsImages = model.input.includes("image");

const userContent = supportsImages
  ? [{ type: "text", text }, ...imageParts]
  : `${text}\n\nThe current model does not support image input.`;
```

## 常见陷阱

- 不要把 runtime 能力状态塞进很多系统提示词里。经常变化的信息更适合放在用户 turn 的最小后缀里，降低缓存污染。
- 不要为了“有图就能答”自动切模型。切换模型是用户可感知的行为，应该由用户选择。
- session 持久化只存用户附件元信息，不存为了本轮请求生成的 base64 / data URL。

## 自检

- 这个能力判断能不能只通过模型元数据完成？
- 如果当前模型不支持，Agent 是明确拒绝视觉判断，还是悄悄找了另一个模型？
- 未来某个模型新增能力时，是不是只改模型定义和 provider 协议测试就能开启？
