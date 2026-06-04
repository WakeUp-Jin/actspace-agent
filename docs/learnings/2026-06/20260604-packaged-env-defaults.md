# 打包应用不能把开发态 `.env` 当运行默认值

关联 history：`docs/histories/2026-06/20260604-1935-kimi-cn-base-url.md`

## 核心问题

开发环境里，应用启动时通常会读取仓库根目录 `.env`。这让很多配置问题被“本地覆盖值”悄悄遮住：开发态一切正常，打包安装版却失败。原因是打包版运行时没有仓库根目录，也不会天然带着开发态 `.env`。

这次 Kimi 连接问题就是典型例子：

```txt
开发态 pnpm dev:log
  -> loadEnv() 读到仓库 .env
  -> KIMI_BASE_URL=https://api.moonshot.cn/v1
  -> 连接正常

打包安装版 Actspace.app
  -> 没有仓库 .env
  -> 使用代码默认 KIMI_BASE_URL
  -> 默认仍是 https://api.moonshot.ai/v1
  -> 国内平台 key 访问国际 endpoint，表现为鉴权失败
```

## 可迁移模式

把“没有任何外部配置时也必须正确”的值写进代码默认值，并用示例配置和测试一起锁住。

```ts
const DEFAULT_BASE_URLS = {
  kimi: "https://api.moonshot.cn/v1",
};
```

`.env` 应该是覆盖层，不是生产正确性的来源。尤其是桌面 app、移动 app、CLI 二进制、Docker image 这类交付物，都要假设用户机器上没有源码仓库里的 `.env`。

## 常见陷阱

- **开发态成功不代表打包态成功**：开发服务器、Electron main、打包 app 的 cwd、资源目录和 env 文件发现路径可能完全不同。
- **区域 endpoint 与 key 绑定**：同一个供应商可能有 `.cn` / `.ai` 等不同平台，key 未必跨平台通用；用错域名时错误表象常常是“key 无效”。
- **只改 `.env.example` 不够**：示例文件帮助新开发者，但打包版真正吃的是代码默认值、持久化设置或安装时注入的配置。
- **只改一个默认值不够**：模型注册表、provider service fallback、env schema、测试 fixture 可能各自有一份默认 URL，必须统一搜索。

## 自检问题

1. 如果删除仓库 `.env` 后再启动，应用是否仍能走到正确 endpoint？
2. 打包产物是否还依赖源码目录、开发脚本或本地 shell 里 export 的变量？
3. 某个默认值是否在 env schema、模型注册表、服务 fallback、UI 示例里重复出现？重复出现时有没有测试锁住一致性？
