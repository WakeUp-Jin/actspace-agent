# 凭据的作用域与路由：秘密、引用、计费与用途分离

合并自两篇：多凭据模型路由要拆开秘密/引用/计费、供应商账户状态需要按用途分离凭据。实现入口：`apps/desktop/src/main/settings/secrets-file.ts`、`packages/llm/llm-service/src/credential-port.ts`。

## 1. 同一供应商多把 Key：三层结构

Key 明文、“模型选哪把 Key”、这把 Key 的价格策略生命周期不同：明文要加密/不可回显/可单独失效；模型绑定要可序列化、可检查引用但不复制秘密；倍率会调整而历史 Usage 成本不能重算。结构：**安全存储保存秘密 → 模型只保存稳定凭据引用 → 运行时解析引用得到本次调用的密钥与有效价格快照**。模型直接存 Key，renderer/settings/导出都易泄密；模型复制倍率，改分组价格会大量漂移；缺失绑定自动回退默认 Key，会把请求送到错账户并产生意外费用。

做法：
1. provider 默认 Key 保持原兼容路径；额外 Key 由 main 生成不含秘密的 `credentialId`。
2. 普通 settings 只存 `credentialId / label / pricingMultiplier / status`，密文单独存。
3. 模型只存可选 `credentialId`；缺省=默认 Key。
4. runtime 同时校验 provider 与 credential，解析目标密钥与倍率；缺失、解密失败、明确不可用直接失败（fail closed）。
5. 模型基础价 × 倍率生成仅属本次调用的 pricing snapshot，写 Usage 时计算成本。
6. 删除 credential 前反查模型引用，仍被使用则阻止删除，不制造悬空引用。

基础价单一事实来源：对版本化内置模型目录，在生成模型读取快照时按稳定精确模型名补价，不把价格复制进每个用户持久化模型——目录更新后旧安装模型即获新元数据，用户覆盖的上下文/显示名/凭据绑定不被迁移改写。陷阱：把 provider 的 `hasApiKey` 当“整个 provider 可用”（默认 Key 缺失时健康的额外 Key 仍可用绑定模型）；绑定额外 Key 前先检查默认 Key；找不到绑定静默用默认 Key（技术成功、业务上跨账户/额度/价格边界）；查历史 Usage 时再乘当前倍率；供应商卡片只按默认 Key 决定是否显示（默认 Key 移除后额外 Key 失去管理入口）；为补价重写旧持久化模型（混淆用户配置与派生视图）；把上游公共目录价当转发供应商官方结算价（只能做估算基线）。

## 2. 同一供应商的不同用途：runtime 凭据 vs 账户凭据

“执行模型请求”和“读取账户级账单/credits”看似同属一家，权限与安全边界却不同：

```text
Provider ├─ runtime credential → 模型请求 / 连接测试 / 目录
         └─ account credential → 账户余额 / 账单 / 管理 API
```

OpenRouter 普通 Key 只能取该 Key 的消费上限，账户级 credits 要 Management Key。混成一个字段会把 Key 限额误当账户余额，并让高权限 Management Key 参与日常请求、扩大暴露面。用两个独立加密存储键，main 里为两种用途构建不同 runtime config；Renderer 只拿 `hasApiKey`/`hasManagementKey` 布尔状态，Management Key 只能单向提交到 main 加密（即使输入框是 password，也不能让明文穿过可回读的 IPC）；断开 provider 要把辅助凭据一并清除。

余额不放 Usage 页：Usage 的事实来源是本地请求事件（token、成本、缓存、工具调用），余额来自远程账户 API，放一页会绑死两条生命周期（新增 provider 要改 Usage 页、空态被远程状态卡打断、刷新频率与错误保留无法由 provider 管）。把“账户状态”建成 provider capability：`getProviderBalance({provider})` → main IPC dispatcher → provider-specific adapter → 标准化 `ProviderBalanceSnapshot` → provider 卡片；URL、响应字段、凭据用途留在适配器内。陷阱：用一个大 switch 渲染每家余额卡（差异泄漏到页面）；刷新失败清空已有值（制造余额归零错觉，应保留上次成功快照并单独显示错误）。

## 自检

1. 模型配置里有没有任何明文 Key 或复制的倍率？找不到绑定凭据时会失败还是回退？
2. 供应商的“余额”若实际是 Key 限额，UI 还能叫账户余额吗？新增一种账户状态要改多少个业务页面？
3. 账户请求失败后，UI 区分“未配置”、“暂时失败”、“真实余额为零”了吗？
4. UI 的“已配置”与“默认 Key 存在”是不是两个独立状态？

来源：`docs/histories/2026-07/20260727-2321-duckcoding-multi-key-model-catalog.md`、`docs/histories/2026-07/20260725-2130-provider-balance-cards.md`。
