# 原子写的固定 tmp 路径是并发陷阱

- 来源：`docs/histories/2026-07/20260704-1110-kairos-notification-center.md` 二轮修复
- 症状：UI 点「暂停」报 `ENOENT: rename 'preferences.json.tmp' -> 'preferences.json'`

## 是什么

「写 tmp 再 rename」是标准的原子写模式：读者永远只会看到完整的旧文件或完整的新文件，
不会读到写了一半的内容。但这个模式只保证**读者**安全，不保证**写者之间**安全——
如果两个写入方共用同一个 tmp 路径，rename 阶段会互相破坏。

## 为什么会炸

时间线（A、B 是两次并发的 `persistEnabled` 调用）：

```
A: writeFile(prefs.tmp)      ← A 写入 tmp
B: writeFile(prefs.tmp)      ← B 覆盖了同一个 tmp（此时还不报错）
A: rename(prefs.tmp, prefs)  ← 成功，tmp 消失
B: rename(prefs.tmp, prefs)  ← ENOENT：tmp 已经被 A 挪走了
```

本项目里触发它甚至不需要用户狂点：一次「开启」control 会先 `start()` 再写
`enabled=true`，紧接着一次「暂停」control 又写 `enabled=false`；再叠加 UI 的
`kairos:write-config`（设置页保存 preferences）也走同一个 `preferences.json.tmp`，
两个**不同进程模块**共用 tmp 名，并发窗口比直觉大得多。

## 怎么修

两层防御，各自解决一半问题：

1. **tmp 名唯一化**（必做）：`${path}.${process.pid}.${Date.now()}.tmp`。
   消除"别人把我的 tmp 挪走"这类跨调用/跨模块冲突。
2. **同一写入方内部串行化**（推荐）：用 promise 链把写入排队——

```ts
let chain: Promise<void> = Promise.resolve();
const persist = (v: boolean) => {
  const next = chain.then(() => writeUnsafe(v), () => writeUnsafe(v));
  chain = next.catch(() => {}); // 队列吞错误防断链；调用方仍从 next 感知失败
  return next;
};
```

只做第 1 条时 rename 不再报错，但「最后完成的写入获胜」仍可能让旧值覆盖新值
（A 先发起却后 rename）；串行化保证落盘顺序与调用顺序一致。

## 核心要点

- 原子写模式的安全承诺只覆盖读者；多写者需要额外的互斥或唯一 tmp。
- tmp 命名带 `pid + 时间戳`（或 `crypto.randomUUID()`）成本为零，应当是默认写法。
- 检查并发冲突时别只盯着"同一个函数被并发调"——**不同模块写同一个文件**
  （本例 controller 与 IPC handler 都写 preferences.json）是更隐蔽的冲突源。
- 失败症状是 `rename ENOENT` 而不是"文件损坏"，很容易被误判成路径/权限问题。

## 自检

1. 你的代码库里 `grep '\.tmp'`，有几处是固定 tmp 名？它们的调用方有没有可能并发？
2. 为什么串行化时队列要 `chain = next.catch(() => {})` 而不是直接 `chain = next`？
   （答：一次失败会让后续所有 `.then` 走 reject 分支，队列永久断链。）
