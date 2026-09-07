# 插件加载有两道不同的信任边界

插件系统常被描述成“读 manifest，然后 import 入口”。这会把两个性质完全不同的动作混在一起：读取可验证的数据，和执行拥有当前进程权限的代码。

## 第一层：数据准入

在任何插件模块求值前，运行时应完成：

- 来源必须显式登记，禁止目录自动扫描和 URL 自动下载；
- plugin、entry、service identity 唯一且可追溯；
- manifest 和 config 只接受 JSON-safe 值；
- 本地插件 integrity 同时覆盖 manifest 和实际模块字节；
- codec / behavior 路径不能逃逸插件根目录；
- Host capability 只能从 Host ceiling 中减少，不能由插件自行扩大。

这一层失败时，插件代码还没有执行，因此可以真正做到 fail-closed。

## 第二层：代码激活

通过数据准入后，Behavior 才能被 import 和 activate。此时重点不再是“它是不是可信文件”，而是资源和贡献是否有明确所有者：

- 实际提供的 service 必须与 manifest `provides` 完全一致；
- listener、timer、watcher、subprocess 和 socket 都要归属 activation disposer；
- activation 失败必须撤销已经建立的贡献；
- shutdown 必须等待异步 disposer 静止；
- 同进程插件仍拥有进程权限，Cordis scope 不是安全沙箱。

## 为什么 Codec 要更早

Session 恢复需要先知道日志事件如何验证和迁移。如果只有 Behavior 激活后才能发现 codec，就会形成循环：恢复 Session 需要启动插件，启动插件又可能依赖 Session。

更稳的顺序是：

```text
显式 source -> 数据准入 -> 发现纯 Codec -> 创建 Session Registry
                                  |
                                  v
                         组合 Behavior -> 激活服务
```

Codec 模块因此必须保持纯：不能启动 timer、进程、网络或注册全局副作用。它描述数据，不拥有运行资源。

## 常见陷阱

1. 只对 manifest 做 hash。Behavior 文件被替换后仍会通过校验。
2. import 后再验证路径和 identity。恶意或损坏模块已经执行，拒绝来得太晚。
3. 把 service namespace 当安全边界。它只能控制可见性，不能限制文件、网络和进程权限。
4. 把 optional frontend 当成 optional plugin。固定前端下，`frontend.required` 应阻止激活；optional frontend 才能忽略并告警。
5. 用测试 fake 证明真实框架准入。合同测试能固定 ActSpace 预期，但不能替代 fresh install、真实 exports、Electron 和 packaged lifecycle。

## 自检

- 一个本地插件只修改 Behavior 文件、不改 manifest，integrity 会失败吗？
- Session 中出现 required plugin event，但对应 codec 未安装时，会拒绝 resume 还是静默跳过？
- activation 中途启动了 subprocess 后抛错，谁负责等待并终止它？

来源：`docs/histories/2026-08/20260822-2344-build-v2-runtime-candidate.md`。
