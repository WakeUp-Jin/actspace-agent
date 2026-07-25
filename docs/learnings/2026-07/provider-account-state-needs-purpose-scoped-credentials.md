# 供应商账户状态需要按用途分离凭据

## 是什么

一个模型供应商可能同时提供“执行模型请求”和“读取账户级账单 / credits”两类 API。它们看似属于同一家 provider，但权限、凭据和安全边界可能完全不同。

正确的建模不是“每个 provider 只有一个 Key”，而是：

```text
Provider
├── runtime credential      → 模型请求 / 连接测试 / 目录
└── account credential      → 账户余额 / 账单 / 管理 API
```

## 为什么不能复用一个 Key

OpenRouter 的普通 API Key 可以获取当前 Key 的消费上限信息，但账户级 credits 接口要求 Management Key。如果把两者混成一个字段，会有两类问题：

1. 把 Key 限额误当成账户余额，产品语义错误。
2. 让高权限 Management Key 参与日常模型请求，不必要地扩大凭据暴露面。

所以应当使用两个独立的加密存储键，并在 main 进程中为两种用途构建不同的 runtime config。Renderer 只获得 `hasApiKey` / `hasManagementKey` 这类布尔状态。

## 余额为什么不应放在 Usage 页

Usage 页的事实来源是本地请求事件：token、成本、缓存和工具调用。账户余额的事实来源则是远程 provider 账户 API。把它们放在同一页会让两条生命周期被迫绑定：

- 新增 provider 时需要修改 Usage 页 UI 和 props。
- Usage 页的空态被远程账户状态卡打断。
- 刷新频率、错误保留和凭据可用性无法由 provider 自己管理。

更稳定的方式是把“账户状态”视为 provider capability：

```ts
getProviderBalance({ provider })
  → main IPC dispatcher
  → provider-specific balance adapter
  → normalized ProviderBalanceSnapshot
  → provider card
```

UI 只渲染标准化快照，但 URL、响应字段和凭据用途仍保留在各 provider 适配器内。

## 常见陷阱

- **用一个大 switch 渲染每家余额卡**：会把 provider 差异再次泄漏到页面。页面只应识别标准化快照和少量文案差异。
- **刷新失败时清空已有值**：短暂网络失败会制造余额归零的错觉。应保留上次成功快照，单独显示刷新错误。
- **把 Management Key 传给 renderer**：即使输入框是 `password`，也不能让明文穿过可读回的 IPC。只能单向提交到 main 进程加密。
- **断开 provider 只删普通 Key**：辅助凭据也属于该 provider 连接的生命周期，必须一并清除。

## 自检问题

1. 当 provider 的“余额”实际是 API Key 限额时，UI 是否还能称它为账户余额？
2. 新增一种 provider 账户状态时，需要修改多少个业务页面？
3. 某个账户请求失败后，UI 是显示“未配置”、“暂时失败”，还是“真实余额为零”？这三者必须被区分。

本文来自 `docs/histories/2026-07/20260725-2130-provider-balance-cards.md` 的实施复盘。
