# 图片配置按次生效与失败阶段诊断

## 用户诉求

更换图片服务后仍失败，批准修复配置刷新与请求/下载/保存错误区分，补回归并通过真实 Chat 复测。

## 主要改动

- `apps/desktop/src/main/runtime-v2/core-tool-ports.ts`：图片 handler 按次读取当前 Settings 配置，不重建其他 ports。
- `packages/tools/core-tools/src/image/node-image-ports.ts`：分请求、下载、解码、保存阶段返回受控错误；只允许已知系统错误码离开 Host；下载 fetch/body 加超时，保留私网与重定向拒绝。
- 两份回归测试覆盖配置缺失/新增/替换/移除、错误阶段、敏感 canary、不自动重复请求、取消、私网拒绝和部分成功。
- 同步图片工具设计与 Chat 执行摘要。

## 原因与边界

Settings 保存成功不意味着已创建端口的闭包会更新；图片凭据是启动时快照。另一个缺口是下载/保存异常被统一当作无效响应，导致只能看到 fetch failed。局部修复不改变服务地址、不自动重试付费生成、不降低网络保护。搜索凭据和图片分析模型仍为原装配路径，未扩大到其他配置的热更新。

## 验证

- 新增回归先红：核心 4 failed / 2 passed，Desktop 1 failed；随后全部变绿。
- 核心工具 25 tests；Desktop 108 files / 769 tests；核心 build、Desktop typecheck 通过。
- 真实 Electron 重启后单次生图成功，PNG 会话产物存在于 Journal；点击打开右侧预览，看见白底蓝圆，约 42 秒，无重复生成。
- 成功一次不证明供应商长期稳定。配置热更新由同实例确定性测试验证，未更换用户真实密钥做额外收费测试。

## 学习

命中“可迁移”“有陷阱”，见 [配置快照与分阶段错误](../../learnings/2026-09/live-config-and-materialization-errors.md)。
