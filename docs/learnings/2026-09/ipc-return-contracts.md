# IPC 的类型断言为什么拦不住字段拼错

跨进程调用常在 preload 写成 `invoke(...) as Promise<Result>`。这个断言只告诉 TypeScript“相信返回值符合 Result”，既不检查 Main handler，也不会在运行时重命名字段。

如果 Main 返回 `{ path }` 而 renderer 读取 `{ workspaceRoot }`，两侧各自都可能编译通过。前端再用 `if (!result.workspaceRoot) return`，用户看到的就是点击后无反应。

小范围修复的关键是让**生产者**也受共享契约约束：在 Main handler 标注 `Promise<SelectWorkspaceDirectoryResult>`，让返回字段直接接受编译器检查。消费端类型断言不能代替这一层。

测试同样要覆盖边界。只 mock 一个“正确的前端响应”，只能证明消费者会处理正确数据；应该调用实际注册的 IPC handler，只 mock 系统目录对话框，再检查返回对象。成功、取消、空选择分别验证，才能避免把无效返回值混入正常取消流程。

自检：测试中的正确对象是谁构造的——生产代码，还是测试自己？如果是后者，这个测试可能绕开了真正需要保护的契约。
