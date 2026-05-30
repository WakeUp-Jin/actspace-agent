# 设置真来源要和运行时适配层分开

关联 history：`docs/histories/2026-05/20260531-0034-kairos-settings-source-of-truth.md`

## 是什么

一个设置系统里通常会同时出现几种“像配置”的东西：

- 用户设置：用户在设置页能改、希望下次启动仍保留的偏好。
- 环境变量：开发 / 部署 / CI 用来注入默认值或密钥的启动输入。
- 领域配置文件：某个子系统自己的规则、边界、prompt 片段。
- 运行态文件：余额、计数器、lastRun、cache 这类运行时不断变化的状态。

它们都长得像“配置”，但不能都当真来源。否则会出现这次 Kairos 曾经遇到的问题：UI 读一个字段，运行时读另一个字段，文档又说第三个字段有效。用户改了设置，却不知道到底哪个东西真的在控制模型。

## 为什么需要

“真来源”混乱通常不是一次写错造成的，而是系统演进时一点点堆出来的：

1. MVP 先用 env，方便启动。
2. 后来有设置页，于是把一部分 env 写进 `settings.json`。
3. 某个子系统需要可编辑文件，又加了 `preferences.json`。
4. 运行时某些字段定型在 controller 构造期，于是又需要重建。
5. 最后 UI、文件、env、内存变量全都能看到同名字段，但只有其中一个真的生效。

这类问题最危险的地方是：它不一定会报错。它会产生“看起来保存成功，但实际没生效”的假稳定。

## 怎么想

### 1. 先给每类数据定角色

```txt
settings.json
  用户可在设置页修改的非敏感设置；设置页即主入口。

secrets.json
  用户保存的敏感信息密文；renderer 只能看到 hasApiKey。

.env / process.env
  启动/开发/部署输入；运行中只作为旧系统适配层，不再做用户设置真来源。

domain config files
  子系统规则与边界，如 paths.json / blocklist.json / rule.md。

runtime state files
  高频变化状态，如 budget-state.json / accumulator / index。
```

### 2. 设置页能改的东西只落一个地方

如果用户在设置页能改“模型”，那模型就应该只写 `settings.json`。领域配置文件里可以出现和模型相关的说明，但不应该再有另一个 `modelId` 参与运行时决策。

```ts
// good: UI -> settings -> runtime constructor
const kairosSettings = settingsService.get().kairos;
const llm = createKairosLlm(kairosSettings.modelId);

// bad: UI 写 settings，但 runtime 又读 preferences/env
const modelFromSettings = settings.kairos.modelId;
const modelFromRuntime = config.preferences.modelId ?? env.KAIROS_MODEL_ID;
```

### 3. env 是适配层，不是用户设置数据库

有些旧模块只会读 env。短期可以让 SettingsService 把设置覆写到 `process.env` 再 reload，这是兼容策略，不是长期语义。新代码如果已经有明确 settings service，就应该直接读 settings，而不是再绕回 env。

判断标准：

- 如果配置主要由开发/部署提供：env 可以是真来源。
- 如果配置由设置页保存：`settings.json` 才是真来源。
- 如果 env 只是为了让旧模块下一轮读到新值：它是 adapter，不是 truth。

### 4. 构造期定型的依赖要明确重建点

LLM service、tool manager、provider format 这类东西通常在 controller 创建时定型。设置变化后不能只改文件，还要定义“什么时候重建”。

```txt
settings:update(kairos.modelId/thinking)
  -> write settings.json
  -> stop old controller
  -> dispose IPC handle
  -> create controller from fresh settings
  -> start respecting preferences.enabled
```

这样用户语义才清楚：保存设置成功后，下一次调用一定用新设置。

## 常见陷阱

- **同名字段跨文件复活**：删掉运行时读取后，默认模板里还留着 `modelId`，后来的维护者会以为它仍然有效。
- **UI 禁用错依赖**：以前 `preferences.json` 坏了要禁用模型下拉；模型迁到 `settings.json` 后，这个禁用条件就应该消失。
- **env 残留误导**：`.env.example` 留着旧字段，用户会继续尝试改 env，然后认为设置页坏了。
- **重建延迟模糊**：写“下次空闲生效”会让用户困惑；除非有强理由，否则设置保存后应有明确同步点。

## 核心要点

1. 一个用户设置只能有一个真来源。
2. env 可以是启动输入或兼容 adapter，但不要让它和设置页争夺真来源。
3. 领域配置文件适合放规则/边界，不适合放设置页里的全局偏好。
4. 运行态数据单独放，不要和用户配置混写。
5. 只要迁移真来源，就要同步 UI 禁用条件、默认模板、文档和测试，否则旧语义会悄悄回来。

## 自检问题

1. 用户在设置页改了某个值后，运行时到底从哪个文件/对象读取它？
2. 如果我删除 `.env` 里的这个字段，设置页保存的值还会不会生效？
3. 这个字段是用户偏好、子系统规则，还是运行时状态？它现在放的位置和这个分类一致吗？
