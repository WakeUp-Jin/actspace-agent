# Electron macOS ad-hoc signing: avoid `codesign --deep`

来源：`docs/histories/2026-06/20260603-2046-macos-ad-hoc-dmg-signing.md`

## 核心概念

`codesign --deep` 看起来像是“帮我递归签完整个 `.app`”，但它在现代 macOS 上已经不适合作为默认签名策略。尤其是 Electron runtime 内置了多个 helper app 和 framework；某些 framework 目录不是传统 symlink 版结构，`codesign --deep` 递归进去时可能报：

```txt
bundle format is ambiguous (could be app or framework)
```

这不是业务代码的问题，而是签名工具在递归判断嵌套 bundle 类型时碰到了 Electron runtime 的特殊结构。

## 为什么这次不能用 `--deep`

本地源码构建只需要降低自用打开摩擦，不需要 Developer ID 身份背书。用 `codesign --deep --sign - Actspace.app` 会强行递归重签 Electron 内置 framework，反而引入失败点。

更稳的本地 ad-hoc 策略是：

```sh
codesign --force --sign - --timestamp=none "Actspace.app/Contents/MacOS/Actspace"
codesign --force --sign - --timestamp=none "Actspace.app"
codesign --verify --no-strict --verbose=2 "Actspace.app"
```

这保留 Electron runtime 内部已有结构，只对我们改过的主可执行文件和外层 app 重新做本地临时签名。

## 关键边界

- `ad-hoc` 签名没有 Apple 开发者身份，`TeamIdentifier` 为空。
- `ad-hoc` 不等于 notarization，不能当作面向公众分发的正式安装包。
- `signed: false` 可以继续表示“不是 Developer ID 正式签名”；用 `signature: "ad-hoc"` 单独标明本地临时签名状态。
- `codesign --verify --strict` 可能仍会卡在 Electron framework 的结构上；本地 ad-hoc 验证可以使用 `--no-strict`。

## 可迁移经验

做 Electron macOS 打包时，不要把签名简化成“对最终 `.app` 运行一次 `--deep`”。更可靠的方式是区分目标：

1. 本地源码自构建：浅层 ad-hoc 签名 + 清楚标注非正式分发。
2. 正式分发：使用 Developer ID 证书、hardened runtime、entitlements、notarization，并考虑引入专门的 Electron 打包/签名工具。
3. 验证产物：manifest 同时记录 `signed`、`notarized`、`signature`，避免把 DMG、ad-hoc 签名和正式 Apple 分发混在一起。

## 自检问题

- 为什么 `ad-hoc` 签名不能被描述成“已签名分发包”？
- 什么时候应该使用 `codesign --verify --no-strict`，什么时候应该坚持完整 Developer ID + notarization？
- 如果未来要对外发布，当前脚本里的 ad-hoc 分支还缺哪些能力？
