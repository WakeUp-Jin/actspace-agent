# 运行中的 Native Host 升级必须切换 inode

来源：`docs/histories/2026-07/20260710-1115-browser-bridge-atomic-reinstall.md`

## 是什么

桌面应用升级本机插件二进制时，不能把新内容直接复制到一个可能正在执行的固定路径。更稳的做法是：先在同目录创建新文件并完成探测，再用原子 `rename` 把目录项切换到新 inode。

运行中的旧进程继续持有旧 inode；之后启动的新进程通过正式路径打开新 inode。升级过程不需要强制结束正在工作的 Native Messaging host，也不会让读者看到写到一半的 Mach-O 文件。

## 为什么直接覆盖会出问题

Chrome Native Messaging manifest 通常注册一个稳定路径，Chrome 可以长时间保持该 host 运行。此时执行：

```ts
await copyFile(sourceBinary, installedBinary);
```

不是“换一个文件”，而是可能直接修改正式路径当前指向的文件内容。对正在执行的本机二进制，这会破坏可执行映射与文件生命周期之间的假设。macOS 上的失败表现不一定是普通退出，而可能出现进程进入不可中断等待并尝试退出的状态，后续 `SIGKILL` 也不能立即完成。

如果健康检查还使用固定间隔轮询，故障会被继续放大：上一轮尚未退出，下一轮已经启动，最终从一次安装失败演变成进程风暴。

## 正确安装顺序

```ts
const tmp = `${target}.tmp-${process.pid}-${randomUUID()}`;

await copyFile(source, tmp);
await chmod(tmp, 0o755);

const probe = await run(tmp, ["help"]);
if (!probe.ok) {
  await rm(tmp, { force: true });
  return failure(probe.error);
}

await rename(tmp, target);
```

这个顺序提供三层保证：

1. **完整性**：正式路径只会指向完整旧版本或完整新版本。
2. **可回退**：新版本探测失败时，旧版本完全不受影响。
3. **运行隔离**：旧进程和新进程分别使用不同 inode。

临时文件名必须唯一。固定的 `target.tmp` 在并发安装时会产生 tmp 文件争用；使用 `pid + randomUUID()` 可以消除这类冲突。

同一产品的每个安装入口都必须遵守这条规则。Desktop 插件服务原子安装并不代表开发 CLI 安全；如果 `install-native-host` 仍直接执行 `go build -o <stable-path>`，开发重载照样可能覆盖 Chrome 正在执行的 inode。Go 路径应先把 binary 构建到目标目录的唯一临时文件，执行 `help` 等最小探测，再 `os.Rename` 到正式路径；构建或探测失败时只清理临时文件。

## 健康检查也要限制并发

原子安装解决首次损坏，single-flight 和串行轮询限制故障扩散：

- main 进程中，同一个状态 key 的并发请求复用一个 Promise。
- renderer 不使用 `setInterval` 盲目发起异步请求，而是在上一轮完成后 `setTimeout` 下一轮。
- 错误结果短暂缓存或退避，避免持续撞击已经异常的外部进程。
- timeout 必须返回真实诊断，不要把超时统一翻译成“二进制无效”。

## 常见陷阱

- 先替换正式文件，再执行 `help`：探测失败时已经破坏旧版本。
- 只修复一个安装入口：Desktop 安装安全，但 CLI/dev installer 仍可能原地覆盖同一正式路径。
- 临时文件放在其他文件系统：跨文件系统 `rename` 不再是同样的原子操作。
- 只在按钮层禁用重复点击：IPC、自动刷新和其他窗口仍可能并发调用。
- timeout 后立即继续固定频率轮询：即使 Promise 已返回，底层进程也未必已经退出。

## 自检

1. 升级路径是修改旧 inode，还是通过 rename 切换到新 inode？
2. 新版本探测失败后，正式路径下的旧版本是否仍能运行？
3. 一次状态探测超过轮询周期时，会不会同时存在多轮子进程？
