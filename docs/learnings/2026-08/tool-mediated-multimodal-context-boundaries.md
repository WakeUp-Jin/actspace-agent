# 工具委托式多模态：从图片到可信上下文

来源任务：Add configurable image inspection。原 HTML，已转 md。

文本模型调用视觉模型，不等于文本模型获得了视觉能力。要设计的是一条受控数据管道：谁能读取哪张图片、图片发给谁、视觉结果如何变成主模型可依赖的上下文。

## 一条请求里五个责任

1. **Intent**：主模型判断是否真需要看图。
2. **Guard**：宿主验证路径、格式、大小。
3. **Observe**：视觉模型只接收问题与图片。
4. **Normalize**：工具包装稳定、版本化的结果。
5. **Reason**：主模型基于文字证据继续工作。

不能合并成“把图片传给另一个模型”：跳过 Guard，工具可能变成本地文件外传通道；跳过 Normalize，Provider 的自由文本、错误对象、提示词注入直接污染主模型上下文。

## 能力、输入、证据不是同一件事

- **原生多模态**：主模型协议直接收 image content part，图片是这次主 LLM 调用的输入。
- **工具委托**：主模型只看到工具定义和最终文字结果；视觉能力属于独立 LLM，主模型拿到的是二手证据。
- **工具结果**：不是 Provider 原始响应，而是宿主承诺的稳定上下文契约，可版本化、截断、脱敏。
- **可观察事实**：视觉输出仍可能出错，提示词要区分直接可见事实、推断、无法确认区域。

## 三层视觉报告

```text
<image_inspection_result version="1">
status: success / provider / model
<visual_report>
## Image brief            整体识别概念
## Answer to question     当前任务的直接结论
## Detailed evidence      Layout / Visible text / Elements and states / Relationships / Visual details / Anomalies and uncertainties
</visual_report>
</image_inspection_result>
```

外层 envelope 属于工具，内层 Markdown 属于视觉报告，职责不同；Detailed evidence 保留足够细节让主模型复核、比较、继续推理。

## 四个坑

1. 把附件等同于授权：当前轮附件可精确放行，但不能由此允许读任意绝对路径。
2. 只信扩展名：`photo.png` 可能不是 PNG，发送前检查文件魔数和普通文件类型。
3. 把图片里的文字当指令：“忽略之前规则”只是待描述的像素证据，不是新的 system prompt。
4. 失败后自动换模型：可能重复计费，也会把同一图片发给用户没预期的第二个 Provider。

关键判断：工具的只读属性只表示不修改本地文件，不表示没有隐私或费用影响；向外部视觉 Provider 发图仍是有数据边界的外部操作。

## 自检

1. 主模型原生支持图片时，是否避免重复注册视觉工具？
2. 工具请求是否只含固定提示词、问题、安全文件名、单张图片？
3. Base64、绝对路径、Key、原始错误体都被挡在 session 与 renderer 之外了吗？
4. 超时、取消、空响应、输出超限是否有稳定且不自动重试的行为？
5. 主模型拿到的是 Provider 输出，还是工具承诺的版本化上下文？
