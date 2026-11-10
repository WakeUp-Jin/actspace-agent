// 桌面端 renderer ⇄ main 的 IPC 契约，按通道主题分文件。只有客户端表面（`apps/*`、
// `packages/client/*`、`packages/host/*`）可以引用这里的类型，`pnpm check:packages` 会检查。
// 新增一个通道时放进对应主题；没有合适主题再建新文件并在这里登记。

export * from "./bootstrap";
export * from "./models";
export * from "./composer";
export * from "./approvals";
export * from "./sessions";
export * from "./workspace-git";
export * from "./workspace-files";
export * from "./artifacts";
export * from "./usage";
export * from "./local-update";
export * from "./plugins";
