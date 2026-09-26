# 自定义连接显示协议图标

## 用户诉求

自定义模型连接没有图标，希望按照 OpenAI 和 Anthropic 的格式显示，并复用 Maka 风格的 provider mark。

## 变更

- 新增协议到 provider mark 的映射：OpenAI Chat/Responses 使用 OpenAI，Anthropic Messages 使用 Anthropic。
- 自定义连接列表、连接详情和创建连接向导统一使用协议图标。
- 复用仓库已有的 `openai.svg` 与 `anthropic.svg`，不新增临时资源。
- 增加协议图标映射测试。

## 验证

- Desktop provider/model settings 测试：42/42 通过。
- `@actspace/shared` 类型检查通过。
