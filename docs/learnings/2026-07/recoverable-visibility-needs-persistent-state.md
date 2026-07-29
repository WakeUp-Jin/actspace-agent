# 可恢复隐藏必须是持久状态，而不是列表过滤

## 是什么

当列表数据会从数据库、历史记录或磁盘扫描结果反向补全时，“从侧边栏移除”不能只写成前端 `filter`，也不能直接删除注册项。更稳妥的模型是在注册项上保存 `hidden` 一类持久可见性状态，让数据存在性和导航可见性保持独立。

## 为什么需要

许多桌面应用会在启动或刷新时执行 reconciliation：读取当前 registry，再从 session、最近目录或扫描结果中补回缺失条目。如果隐藏只存在于组件状态，重启后会丢失；如果删除 registry 条目，只要历史 session 仍指向该路径，下一次 reconciliation 又会把它补回来。

因此需要区分两个问题：

- 资源是否存在：Workspace、session 和本地文件仍然保留。
- 资源是否出现在导航中：由 `hidden` 决定，并跨重启保存。

## 推荐模型

```ts
type RegistryEntry = {
  id: string;
  path: string;
  hidden?: boolean;
};

function mergeDiscoveredPath(registry: RegistryEntry[], path: string) {
  const existing = registry.find((item) => item.path === path);
  if (existing) return registry; // 保留 existing.hidden
  return [...registry, { id: createId(), path }];
}
```

恢复操作也应是显式状态转换。例如用户重新选择同一绝对路径时，将 `hidden` 清为 `false`，而不是创建第二个相同路径的条目。

## 持久状态还需要串行读改写

只把 `hidden` 存下来仍不够。如果启动期的多个读取都会执行 reconciliation 并可能回写 registry，那么它们实际上都是写操作。多个调用共享固定的 `workspaces.json.tmp` 时，一个调用完成 `rename` 后会移走临时文件，另一个调用随后得到 `ENOENT`；即使临时文件名唯一，不串行化完整的“读 → 合并 → 写”流程，也可能用较旧快照覆盖刚更新的 visibility。

因此应该以 registry 文件为粒度排队完整操作，而不是只排队最后一次 `writeFile`：

```ts
const chains = new Map<string, Promise<void>>();

function runSerialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  chains.set(key, result.then(() => undefined, () => undefined));
  return result;
}
```

落盘时仍应使用带进程标识和随机后缀的唯一临时文件，再原子 `rename` 到正式文件。串行化保护读改写语义，唯一临时文件则是对意外并发和未来调用路径变化的第二层防御。

## 另一个必要不变量：当前选择始终可见

隐藏或批量归档可能影响当前正在显示的 session。执行破坏导航落点的操作前，应先选择新的可见落点：

1. 对目标集合做快照，避免切换后把新 session 误算进批处理。
2. 优先切换到目标集合之外、且不属于隐藏 Workspace 的现有 session。
3. 如果不存在，先在安全的默认 Workspace 创建 session。
4. 落点建立成功后，再隐藏或归档原目标。

这个顺序避免出现“侧边栏已经移除，但主内容区仍指向不可到达对象”的幽灵状态。

## 常见陷阱

- reconciliation 发现已有路径时覆盖整条记录，意外把 `hidden` 重置。
- 隐藏 Workspace 后只过滤普通分组，却忘记过滤 Pinned 等第二个入口。
- 批量操作先切换/新建，再重新查询目标集合，把新落点也一起归档。
- fallback 只排除目标集合，没有排除此前已隐藏的 Workspace。
- 把“隐藏”实现成删除，导致恢复能力和历史关联一起丢失。
- 只给 `writeFile` 加队列，却让多个调用在队列外读取旧快照，仍可能发生 lost update。
- 多个原子写共享固定 `.tmp` 文件名，先完成的 `rename` 会让后续调用报 `ENOENT`。

## 自检问题

1. 应用重启并重新扫描历史 session 后，隐藏条目是否仍保持隐藏？
2. 同一资源是否可能从普通列表、Pinned、搜索结果等多个入口泄漏出来？
3. 隐藏当前资源前，新的当前选择是否已经建立且可见？
4. 所有可能回写 registry 的读取和更新，是否共享同一个串行化边界？

来源：`docs/histories/2026-07/20260729-1339-workspace-sidebar-actions.md`
