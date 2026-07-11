# Unpacked Chrome Extension 也需要稳定身份

来源：`docs/histories/2026-07/20260710-1115-browser-bridge-atomic-reinstall.md`

## 是什么

Chrome Native Messaging host 不只依赖 host 名称和二进制路径，还会通过 `allowed_origins` 精确允许某个 Chrome extension ID。对于本地加载的 unpacked extension，如果 manifest 没有固定公开 `key`，扩展 ID 可能随加载路径或环境变化。

结果是两边看起来都正常：Chrome 显示扩展“已启用”，Native Host manifest 也存在，但 extension 调用 `connectNative()` 时仍会被 Chrome 拒绝。

## 正确做法

在 extension manifest 中保存固定公开 key：

```json
{
  "manifest_version": 3,
  "key": "<base64 encoded DER public key>"
}
```

Chrome extension ID 由公开 key 的 SHA-256 摘要前 16 字节计算，每个半字节映射到 `a` 到 `p`。因此同一份 manifest 无论放在哪个绝对路径，都会得到同一个 ID。

Native Host 安装器使用这个稳定 ID生成：

```json
{
  "allowed_origins": [
    "chrome-extension://<stable-extension-id>/"
  ]
}
```

## 为什么还要测试

manifest 属于 JavaScript/Chrome 资产，Native Host 安装器属于 Go 代码，两者没有天然的编译期依赖。只靠注释同步，未来修改 key 或复制代码时很容易再次漂移。

测试应读取真实 `manifest.json`：

1. base64 解码公开 key。
2. 按 Chrome 算法计算 extension ID。
3. 断言结果等于 Go 的默认 ID。
4. 断言默认安装出的 `allowed_origins` 使用同一 ID。

`doctor` 也应读取已安装 Native Host manifest 并检查 origin，而不是只检查文件和二进制是否存在。这样“扩展已启用但连不上”会直接显示身份不匹配，而不是误导为普通 socket offline。

## 常见陷阱

- 把开发者电脑上某次生成的 unpacked extension ID 直接写进代码。
- 只检查扩展开关是否开启，不检查 Service Worker 的 Native Messaging 连接。
- 只验证 Native Host manifest 文件存在，不验证 `allowed_origins`。
- 仓库迁移后继续从旧路径加载扩展，导致代码、版本和身份来源混杂。

## 自检

1. 扩展移动目录后 ID 是否保持不变？
2. Native Host 默认 allowlist 是否由测试锁定到 manifest key？
3. doctor 能否区分“host 未注册”“origin 不匹配”和“extension 尚未启动 host”？
