---
description: "测试辅助：各包测试共用的最小断言。"
kind: "package-group"
---

# test-support

一个库包，放测试共用的辅助。当前只导出 `assertJsonSafe`；Cordis 服务生命周期夹具已放进 `composition/cordis-adapter/tests/fixtures/`，避免适配器测试深路径反向依赖本包。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `test-support` | 库 | 库 | — | `assertJsonSafe`：断言值能安全序列化为 JSON；保留作测试辅助入口 |

## 包之间怎么连

- 不依赖其他包，目前没有包依赖它；不在插件清单里。
- 退役条件见[包 README](test-support/README.md)。

## 入口与测试

- `test-support/src/index.ts`。没有独立测试。

## 怎么扩展

只放至少两个包的测试都要用、且不依赖具体插件的辅助。与某个插件相关的夹具放进该插件自己的测试目录。通用步骤见[总地图](../README.md)。
