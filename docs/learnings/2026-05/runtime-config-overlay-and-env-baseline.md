# 运行时配置生效：用 process.env 覆盖 + 重载冻结 env，并守住 env baseline

来源：`docs/histories/2026-05/20260529-1950-settings-page.md`

## 是什么

应用启动时把环境变量解析成一个**冻结的 `env` 对象**（`loadEnv()` 一次性读取 `process.env` + `.env`，构造只读 Proxy）。问题来了：用户在 UI 里改了配置（模型 Key、温度、工具开关、bash 审查），怎么让它**不重启就生效**？

这次采用的模式：设置服务把变更**写回 `process.env`，再调一次 `loadEnv()` 刷新冻结的 `env`**。因为所有消费方都是"每次用时通过 `env` proxy 动态读取、不缓存解构值"，刷新后的下一次读取即生效。

```txt
renderer 改设置 → IPC → SettingsService.update()
  → 写 settings.json
  → applyToEnv(): 覆盖 process.env[...] → loadEnv() 重建冻结 env
  → 下一轮 turn / 下一条命令读 env proxy 时拿到新值（无需重启、无需新模块）
```

关键收益：`agent-core` 零改动。生效通道是"写 `process.env` + `loadEnv()`"这个**既有公共接口**，不需要在 agent-core 里新增 override 层，也就不会破坏"agent-core 不依赖 desktop"的边界。

## 为什么不直接改 env 对象

`env` 是 frozen Proxy，写不动；而且就算能写，也只是补丁式地改某几个字段，容易和 `.env` 文件、默认值的优先级规则脱节。统一走 `process.env` + `loadEnv()` 的好处是**优先级规则只有一份**（`process.env[key] ?? fileVars[key] ?? default`，空串视为未设置），UI、`.env`、默认值三者的合并逻辑不会出现第二套实现。

## 陷阱：无值时"删除 env"会误删外部注入的变量

最初的 `applyToEnv()` 对供应商 Key 是这么写的：

```ts
// ❌ 有 UI Key 则写，否则删除（指望 loadEnv 从 .env 文件回填）
setOrDeleteEnv("DEEPSEEK_API_KEY", uiKey); // uiKey 为空 → delete process.env.DEEPSEEK_API_KEY
```

它依赖"`loadEnv()` 会从 `.env` 文件把删掉的变量再读回来"。但这只在 Key 来自 `.env` **文件**时成立。如果 Key 来自**真实环境变量**（Docker/CI/`export`），`.env` 文件里并没有，删掉后 `loadEnv()` 无从回填——于是用户**从没在 UI 配过 Key，却被应用悄悄清掉了外部注入的 Key**。

修复：构造时拍一份 baseline 快照，"无 UI 值"时**还原 baseline**而不是删除。

```ts
// 构造时（任何 applyToEnv 之前，process.env 还是干净的）
this.providerEnvBaseline = {
  deepseek: process.env.DEEPSEEK_API_KEY,
  kimi: process.env.KIMI_API_KEY,
};

// applyToEnv 时
const uiKey = this.getDecryptedKey(provider);
setOrDeleteEnv(envKey, uiKey ?? this.providerEnvBaseline[provider]);
// 有 UI Key → 覆盖；无 → 还原快照（.env 文件值 或 外部 env 变量），不会误删
```

这个 bug 是写**确定性单测**时逼出来的：测试用不存在的 `.env` 路径刷新 env，于是"删除后靠 .env 文件回填"的假设直接失效，暴露了生产环境同样存在的隐患。**单测的确定性约束反过来发现了真实正确性问题**。

## 配套模式：注入式加密接口，让 main 服务可单测

API Key 用 Electron `safeStorage` 加密落盘。但 `safeStorage` 只能在 Electron 运行时用，直接 `import { safeStorage } from "electron"` 会让整个服务在 vitest 里无法加载。

做法：服务**只依赖一个接口**，electron 实现放在调用方（`main/index.ts`）注入。

```ts
export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}
// settings-service.ts 不 import electron；测试注入假实现，生产注入 safeStorage 包装
```

同理把"刷新 env"也做成可注入的 `reloadEnv`，测试里传一个指向不存在 `.env` 的 `loadEnv`，env 就完全由 `process.env` 决定，不受仓库根 `.env` 干扰。

## 核心要点

- 想"改配置不重启"，优先复用"写 `process.env` + 重新加载"这条既有路径，别新造 override 模块——优先级规则只留一份，依赖边界也不破。
- 消费方必须**每次动态读 env proxy**、不缓存解构值，刷新才有意义。
- "无值就删除 env"是隐性破坏：删之前先想清楚原值来自 `.env` 文件还是外部真实环境变量。**构造时快照 baseline、无值时还原**才安全。
- main 进程里依赖 Electron 单例（`safeStorage`/`app`）的逻辑，用注入接口隔开，才能脱离 Electron 跑单测。
- 敏感信息分文件存：非敏感 `settings.json`，密文 `secrets.json`；对外只暴露 `hasApiKey` 布尔，不回明文。

## 自检问题

1. 我改的这个配置，消费方是"启动时读一次"还是"每次用时读 env proxy"？前者不重启不会生效。
2. `applyToEnv` 里对某个 key"无值即删除"，会不会把用户从未在 UI 配过、但由 `.env` 文件或外部环境注入的值也一起删掉？
3. 这个 main 服务能在没有 Electron 运行时的 vitest 里被 import 吗？如果不能，哪个 electron 依赖该改成注入？
