# pnpm workspace 里的 Electron portable release

来源：`docs/histories/2026-05/20260528-0123-release-desktop-archive.md`

## 核心思路

在还没有引入 `electron-builder` / `electron-forge` 时，也可以先做一个最小真实 release：构建 Electron main/preload/renderer，生成 production dependency tree，然后把这些文件放进当前平台的 Electron runtime。

这类产物不是正式安装包，也没有签名或 notarization，但它比“仓库元数据 tgz”更接近真实交付链路：SBOM 和 provenance 指向的已经是可运行的桌面 archive。

## 可复用模式

1. `pnpm --filter <app> build` 先生成运行时产物。
2. `pnpm --filter <app> --prod deploy --legacy --offline <dir>` 生成 production app 目录。
3. workspace package 用 `files` 白名单限制 deploy 内容，例如只带 `dist` / `dist-electron`。
4. 将 app 目录放进 Electron runtime：
   - macOS: `<App>.app/Contents/Resources/app`
   - Linux: `<runtime>/resources/app`
5. release manifest 明确标注 `signed: false` 和 `notarized: false`，避免把 portable archive 误认为正式安装包。

## 容易踩的坑

- `pnpm deploy` 在 pnpm 10 默认要求 injected workspace；不满足时需要 `--legacy`。
- 离线或受限网络环境下，deploy 可能尝试访问 registry；如果依赖 store 已就绪，可用 `--offline` 让失败更早暴露。
- 没有 `files` 白名单时，workspace package 可能把 `src`、测试和配置也放进 release app resources。
- TypeScript 的 main/preload 构建可能输出测试目录或 `.map` / `.d.ts`；如果不想改编译边界，可以在 release 脚本里做 release-only prune。
- `pnpm ci` 在 pnpm 10 会命中 pnpm 自己尚未实现的内置命令；要执行 package script，应写成 `pnpm run ci`。

## 什么时候该升级工具链

这个模式适合 Phase 2：先让 release 产物代表真实应用。等需要签名、notarization、dmg/installer、自动更新、多平台 matrix 和更完整的 app metadata 时，再引入专门的 Electron 打包工具更合适。
