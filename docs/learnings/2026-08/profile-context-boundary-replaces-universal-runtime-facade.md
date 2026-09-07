# 用 Profile Context 边界替代 Universal Runtime Facade

## 是什么

当一个 Runtime facade 同时承载 Session、Agent、LLM、Tool、Projection 和 shutdown 时，它会逐渐成为跨 Host 的 God Object。Profile-first 结构把固定 Bootstrap 收敛为一个 root Context、解析后的 manifest 和 shutdown 边界；Headless/Desktop 应用能力分别由 Bundle Service 从 Context 取得。

## 为什么需要

统一 facade 看似减少 Host 适配代码，实际上让任何新能力都必须修改中心类型，并迫使 Desktop、CLI 和未来 Web 共享一个并不自然的操作面。Bundle Service 能按产品运行面拥有自己的 API，同时仍复用同一个 Session/Agent 领域 Service。

## 核心模式

```text
Host capabilities
  -> explicit Profile composition
  -> one Cordis root Context
  -> BootedProfile { context, root, manifest, shutdown }
  -> HeadlessRunner / DesktopAppService
```

Context 是进程内 ownership 边界，不是 IPC DTO。Renderer 仍只接收 Projection DTO；Host 负责 artifact、窗口和事件 buffer。

## 常见陷阱

- 只删除类型名、保留同样的万能对象，属于改名而非架构迁移。
- 新增 loader entry 后，必须同时处理 workspace package resolution；隔离 node_modules 下的 Loader 不会自动看到未被依赖声明的包。
- Profile 的静态 composition 与 file-backed `cordis.yml` 必须有一致的 transport 校验，否则 digest 正确也可能加载错误的插件树。

## 自检问题

1. 一个应用操作是否属于某个产品 Bundle，而不是所有 Host 都需要的 Runtime 核心？
2. shutdown 是否仍由唯一 root owner 执行，并在 Journal flush 后释放？
3. 任何跨进程数据是否已经降级为稳定 Projection/IPC DTO，而不是暴露 Context 或 Fiber？
