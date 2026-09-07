# 品牌身份不能由传输适配器推断

一组服务可以共用 OpenAI-compatible 传输，但这不代表它们拥有相同品牌。若用运行时路由选择 Logo，OpenAI、Mistral 等连接就会全部显示 OpenRouter 标识。

把三个问题分开：

| 字段 | 回答的问题 |
| --- | --- |
| catalogId / logoKey | 这项预设向用户展示哪个品牌？ |
| connectionId | 用户保存的是哪一份地址、凭据和模型配置？ |
| runtimeProviderId | 发请求时复用哪个协议适配器？ |

显示时从 catalogId 查显式品牌注册表；执行时从 connectionId 解析真实配置，再进入对应传输。未知品牌显示中性图标，不能借用传输适配器的品牌。Logo 应保存真实 SVG 资源与来源，单色图形用 CSS mask 随主题改变前景色。

回归测试需要覆盖“保存后的连接行”，而不只是“添加目录”。目录可以直接拿到 logoKey；保存后若丢失 catalogId 的映射，视觉仍会退回错误品牌。测试夹具应故意让 catalogId 与 runtimeProviderId 不同，例如 OpenAI 预设复用兼容适配器。

自检：两个连接使用相同协议，是否一定使用相同 Logo？答案是否定的。展示身份、用户配置实例和执行策略是不同的维度。
