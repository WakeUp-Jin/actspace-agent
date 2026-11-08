# 进程边界的接口只写一份：从契约生成各端，生产者也受契约约束

合并自：进程边界的接口只写一份、IPC 的类型断言为什么拦不住字段拼错。

Electron 应用的 renderer 和 main 之间隔着一层 preload。最常见的写法是三处各自手写：

- preload 里 `getSession: (id) => ipcRenderer.invoke("session:get", id)`；
- `global.d.ts` 里 `getSession?: (id: string) => Promise<Session>`；
- main 里 `ipcMain.handle("session:get", (_e, id) => …)`。

三处之间没有任何约束。少暴露一个方法、改了参数顺序、channel 拼错，编译都能过，运行时才看到 `undefined is not a function`。

## 可选成员让类型检查失明

手写声明时，大家很自然地把成员写成可选（`getSession?:`），理由是「浏览器预览里没有 preload」「旧版本可能没这个方法」。代价有两层：

1. **调用方到处写兜底**。`window.actspace?.getSession?.(id)`、`if (!window.actspace.x) return`、「当前环境不支持…」。ActSpace 重构前 renderer 里有约 220 处这样的检查。真实桌面端里它们永远不会生效，却让每段逻辑多出一个没人测的分支。
2. **tsc 不再报错**。成员可选时，漏实现、漏暴露和「环境不支持」在类型上是同一回事，编译器没法区分。

所以要反过来：**bridge 要么完整，要么启动就失败**。成员全部必选，启动时如果没有 bridge，就显示致命错误页，不渲染 App。兜底分支就没有存在的理由了。

## 一份契约，生成四个端

```ts
// packages/shared：唯一事实来源
export const desktopBridgeContract = {
  sessions: {
    get: invoke<SessionGetInput, SessionProjection | null>(CH.getSession),
    listPage: invokeWithDefault<ListInput, Page>(CH.listSessionPage, {}),
  },
  events: {
    hostsChanged: event<HostRecord[]>(HOST_IPC.changed),
  },
} as const;
```

| 端 | 怎么从契约来 |
| --- | --- |
| 类型 | `BridgeOf<typeof contract>` 推导出每个方法的签名，`Window.actspace` 直接用它 |
| preload | `buildBridge(contract, ipcRenderer)` 按 spec 生成冻结对象，preload 本身不写方法 |
| main | `ipc.handle(contract.sessions.get, (input) => …)`，入参和出参类型由 spec 推导，注册器统一做 sender 校验和入参 guard |
| mock / 测试 | 同一个 `buildBridge`，transport 换成内存实现；没实现的成员调用时 reject，不静默返回空值 |

改一个方法签名，四个端在编译期一起报错。再加一个审计脚本，核对「契约里的 channel = main 注册的 channel = 常量表」，连「main 忘了注册」这种类型系统管不到的错也能拦住。

关键在于 **spec 是值，不只是类型**。只写类型（`interface DesktopBridge`）的话，preload 和 main 还得各自手写实现。spec 对象在运行时能遍历，所以 preload、mock 和审计脚本都能从它生成或核对。

## 这次踩到的坑

- **grep 门槛只认一种写法**。迁移测试时用 `window\.actspace\s*=` 当验收 grep，漏了 `(window as {…}).actspace = …` 和 `delete (window as …).actspace`，9 个文件因此没迁移。审计脚本要覆盖成员访问、可选链、类型断言、下标和解构这几种写法，最好再拿迁移前的代码反向跑一次，确认它确实能报出问题。
- **类型断言要放在会被 tsc 检查的地方**。`expectTypeOf` 写在一个被 tsconfig `exclude` 掉的测试目录里，vitest 照常跑完，但断言从来没被类型检查过。写完类型测试之后，故意改错一个类型，确认 typecheck 会失败。
- **只禁 `window.actspace` 不够**。业务代码可以 `import { getBridge } from "api/bridge"` 绕开按域划分的 `api/<域>`。规则要同时限制「谁能导入入口模块」。
- **「按需加 guard」等于没有机制**。入参 guard 最初的规则是「涉及路径、设置写入或远端 Host 时再加」，一个月后 130 个 invoke 只有 36 个有 guard，其余靠 handler 自觉；注册器查不到 guard 就 `input as SpecInput` 透传，没人能发现遗漏。修法不是补完 65 个 guard 就算，而是把登记表定义为「契约全部 invoke」：测试断言两者相等、注册器缺 guard 直接抛错，无入参的也显式登记 `NO_INPUT`。靠人判断「这个要不要」的策略，要么改成全集，要么就假设它会漂移。
- **契约会暴露旧代码的类型谎言**。出参类型一收紧，main 里冒出 16 处不一致，比如共享类型写的是 `{ requestId }`，main 实际返回 `{ requestedAt }`。这些原本被 preload 里的 `as Promise<…>` 掩盖，迁移时要逐个核对线上负载，再决定改类型还是改实现。

## 生产者也要受契约约束：`as Promise<Result>` 拦不住字段拼错

preload 里常写 `invoke(...) as Promise<Result>`，这个断言只告诉 TypeScript“相信返回值符合 Result”，既不检查 Main handler，也不会在运行时重命名字段。Main 返回 `{ path }` 而 renderer 读 `{ workspaceRoot }`，两侧各自编译通过，前端 `if (!result.workspaceRoot) return`，用户看到的是点击后无反应。小范围修复的关键是让**生产者**也受共享契约约束：Main handler 标注 `Promise<SelectWorkspaceDirectoryResult>`，让返回字段直接接受编译器检查，消费端类型断言代替不了这一层。

测试同样要覆盖边界：只 mock 一个“正确的前端响应”只证明消费者会处理正确数据；应调用实际注册的 IPC handler、只 mock 系统目录对话框，再检查返回对象，并分别验证成功、取消、空选择，避免把无效返回值混入正常取消流程。自检：测试里的“正确对象”是生产代码构造的，还是测试自己构造的？后者可能绕开了真正需要保护的契约。

## 自检

1. 为什么契约要用运行时可遍历的 spec 对象，而不只是 TypeScript 接口？
2. 删掉 `window.actspace?.` 之后，浏览器开发模式靠什么继续工作？如果 mock 的 bridge 少了一个成员，会发生什么？
3. 在你的项目里，哪些「可选」其实是在掩盖「没实现」？

来源：[Desktop 前端重构 13 history](../../histories/2026-10/20261006-0208-desktop-fe-13-preload-bridge.md)。
