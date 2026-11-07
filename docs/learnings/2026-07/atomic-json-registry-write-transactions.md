# 原子 rename 不等于并发安全：唯一 tmp 名 + read-modify-write 串行化

合并自：原子写的固定 tmp 路径是并发陷阱（Kairos 通知中心二轮修复）、原子 rename 不等于并发安全的 JSON Registry。

关联：`docs/histories/2026-07/20260704-1110-kairos-notification-center.md`、`docs/histories/2026-07/20260729-1515-workspace-git-worktree-context.md`

## 1. 写 tmp 再 rename 只保证读者安全

读者永远只看到完整旧文件或完整新文件，但写者之间不受保护。多个写入方共用同一 tmp 路径时：

```
A: writeFile(x.tmp)   B: writeFile(x.tmp)（覆盖同一个 tmp，仍不报错）
A: rename(x.tmp, x)   成功，tmp 消失
B: rename(x.tmp, x)   ENOENT
```

症状是 `rename ENOENT` 而非“文件损坏”，容易被误判成路径/权限问题。它不需要用户狂点就能触发：一次「开启」先 `start()` 再写 `enabled=true`，紧接着「暂停」写 `enabled=false`；再叠加设置页保存 preferences，**不同模块**写同一个 `preferences.json.tmp`，并发窗口比直觉大。检查冲突时别只盯“同一个函数被并发调”，不同模块写同一个文件是更隐蔽的来源。（Kairos 的 `persistEnabled`/`kairos:write-config` 已随 v1 移除，机制仍适用。）

## 2. 唯一 tmp 名只解决 rename 冲突

`${path}.${process.pid}.${randomUUID()}.tmp` 零成本，应当是默认写法，并在 `finally` 中尝试清理本次 tmp（清理失败不得覆盖原始错误）。但两个调用仍可能同时读取旧快照、各自追加不同条目，最后完成的写入覆盖另一个的结果；或者 A 先发起却后 rename，“最后完成者获胜”让旧值覆盖新值。

## 3. 串行化的单位是完整 read-modify-write 事务

```text
读取当前 registry -> 校验/修复 -> 合并新条目 -> 写唯一 tmp -> 原子 rename
```

进程内用 Promise queue 或 mutex 按 registry 路径串行：

```ts
let chain: Promise<void> = Promise.resolve();
const persist = (v) => {
  const next = chain.then(() => writeUnsafe(v), () => writeUnsafe(v));
  chain = next.catch(() => {});   // 队列吞错防断链；调用方仍从 next 感知失败
  return next;
};
```

不写 `chain = next` 的原因：一次失败会让后续 `.then` 全走 reject 分支，队列永久断链。

要点：
- 可能“修复并写回”的读也是写，必须进同一队列；
- 被锁住的内部函数不要再调公开的加锁函数，否则等待自己死锁；
- 并发测试不能只断言“没报错”，要并行注册多个不同条目再确认最终文件保留全部。

## 4. 边界

进程内队列只协调同一进程。若允许多个独立进程修改同一 registry，需要文件锁、单一写入服务或数据库事务，不是继续扩大进程内 mutex。

## 自检

1. `grep '\.tmp'`，有几处固定 tmp 名？调用方会不会并发，是否来自不同模块？
2. 为什么唯一 tmp 解决了 `ENOENT` 仍可能丢条目？
3. 哪些看起来是“读取”的函数实际必须进写事务队列？
4. 多进程写同一文件时，当前方案缺什么？
