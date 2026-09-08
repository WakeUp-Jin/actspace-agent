# ActSpace v2 P00：契约地基与 ESM Runtime 隔离岛 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-p00-contracts-and-esm-island.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 19:50
- **结束时间**：2026-08-22 20:03

## 执行时间线

### 步骤 1：建立隔离 package 与 shared 子路径

- **操作**：新增 `@actspace/agent-runtime` ESM NodeNext strict package；新增 `@actspace/shared/runtime-v2` 子路径。
- **影响文件**：`packages/agent-runtime/**`、`packages/shared/package.json`、`packages/shared/src/runtime-v2/**`、`pnpm-lock.yaml`。
- **决定**：新 Runtime 根入口只重导出 Host DTO 类型，不发布 `RuntimeHandle`、Cordis 或 pi-ai 对象。
- **验证**：shared 与 agent-runtime 均通过 TypeScript 5.9.3 编译；构建产物为 ESM。

### 步骤 2：固化 JSON-safe 与 capability ceiling 约束

- **操作**：实现 JSON-safe 校验和深冻结；增加 capability ceiling 只减函数；覆盖三种 Host kind、非法宿主对象和诊断明细。
- **影响文件**：`packages/shared/src/runtime-v2/host-dto.ts`、`packages/shared/src/runtime-v2/index.ts`、`packages/shared/src/runtime-v2/test/host-dto.test.ts`。
- **决定**：capability ceiling 是受信任插件的 admission 上限，不被描述为安全沙箱；任何新增能力请求均抛出错误。
- **验证**：DTO 测试 4/4 通过；独立 Node smoke 验证 JSON 往返、非法 `Date` 拒绝与递归冻结。

### 步骤 3：锁定公共边界并运行仓库检查

- **操作**：增加 package metadata 边界测试；扫描新公共入口中的 v1 Session、Cordis、pi-ai、Electron 与 Secret 引用。
- **影响文件**：`packages/agent-runtime/src/test/package-boundary.test.ts`、`packages/agent-runtime/vitest.config.ts`。
- **决定**：测试配置使用无运行时 import 的普通配置对象，避免配置加载本身依赖 package 自解析。
- **验证**：package boundary 测试 2/2 通过；静态隔离扫描无匹配；`check:docs`、`check:repo`、`check:secrets`、`git diff --check` 全部通过。

## 遇到的问题

- **问题**：执行 `pnpm install` 时 registry 网络不可用，随后外部执行审批服务返回 503，根依赖树只恢复了一部分。
  - **原因**：不是 P00 源码错误，而是依赖下载与审批基础设施不可用。
  - **应对**：当时停止重复安装；先使用仓库缓存的 TypeScript 5.9.3 和 Vitest 4.1.8 验证同一测试，未修改依赖解析或创建临时生产软链。2026-08-23 已再用 workspace 锁定的 Vitest 3.2.4 重跑通过。
- **问题**：一次 lockfile-only 更新顺带漂移了 `picomatch` 和 `tinyglobby` snapshot。
  - **原因**：当前解析器基于可见 package metadata 重新选择了传递 snapshot。
  - **应对**：逐项恢复无关 snapshot，最终 `pnpm-lock.yaml` 只新增 `packages/agent-runtime` importer。

## 后续集成边界

- workspace 锁定的 Vitest 3.2.4 已通过 6/6；fresh install 仍受 Cordis/pi-ai registry records 缺失阻断。
- fresh registry install 与完整 Electron package smoke：属于 P01 Cordis 准入门禁，不由 P00 冒充完成。
