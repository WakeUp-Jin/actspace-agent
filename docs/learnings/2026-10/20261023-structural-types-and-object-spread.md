# 类型收窄不会删除运行时字段

把一个完整对象传给只声明少数字段的 TypeScript 参数，函数实际收到的仍是完整对象。结构类型只检查赋值是否兼容，不会在运行时筛掉额外字段。

例如，文件目标只声明身份：

```ts
type FileTarget = { workspaceRoot?: string; hostId?: string };
const oldTab = { workspaceRoot: "/project", content: "旧正文", kind: "text" };

function convert(newContent: string, target: FileTarget) {
  return { content: newContent, ...target };
}

convert("文件不存在", oldTab); // 实际 content 仍是“旧正文”
```

调用可以通过类型检查，因为 `oldTab` 包含 `FileTarget` 需要的字段。对象展开却会复制它的所有可枚举字段，后面的旧 `content` 因而覆盖新的读取结果。参数声明和 `as FileTarget` 都无法改变这一点。

当目标只负责身份时，在转换边界显式投影字段：

```ts
function convert(newContent: string, target: FileTarget) {
  return {
    workspaceRoot: target.workspaceRoot,
    hostId: target.hostId,
    content: newContent,
  };
}
```

仅调换展开顺序能保护当前已知字段，却仍会携带未来新增的旧状态。显式提取身份字段，才能清楚表达“正文、渲染类型和新鲜度来自这次读取”的归属。

测试也要覆盖实际调用边界。只用 `{ workspaceRoot }` 测转换函数会通过，却遗漏调用方传入完整旧 Tab 的情况。本次补充了真实 RightPanel 的“重新加载”按钮集成回归：一条返回不存在说明，一条返回更新正文，都要求旧正文消失，并保持读取目标不变。

自检：参数变窄后对象里还会不会有额外字段？转换函数允许哪些字段来自旧对象？测试中的输入形状是否与真实调用方一致？

来源：[BUG-044](../../exec-runs/20261021-actspace-full-acceptance/execution-summary.md#bug-044)、[本轮 history](../../histories/2026-10/20261022-0746-acceptance-small-fixes.md)。
