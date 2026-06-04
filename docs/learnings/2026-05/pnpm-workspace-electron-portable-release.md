# pnpm workspace 里的 Electron portable release

来源：`docs/histories/2026-05/20260528-0123-release-desktop-archive.md`

## 核心思路

在还没有引入 `electron-builder` / `electron-forge` 时，也可以先做一个最小真实 release：构建 Electron main/preload/renderer，生成 production dependency tree，然后把这些文件放进当前平台的 Electron runtime。

这类产物不是正式安装包，也没有签名或 notarization，但它比“仓库元数据 tgz”更接近真实交付链路：SBOM 和 provenance 指向的已经是可运行的桌面 archive。macOS 上还可以从同一个 `.app` 派生本地安装用 `.dmg`，提供更接近普通用户习惯的“打开磁盘映像、拖到 Applications”体验。

## 可复用模式

1. `pnpm --filter <app> build` 先生成运行时产物。
2. `pnpm --filter <app> --prod deploy --legacy --offline <dir>` 生成 production app 目录。
3. workspace package 用 `files` 白名单限制 deploy 内容，例如只带 `dist` / `dist-electron`。
4. 将 app 目录放进 Electron runtime：
   - macOS: `<App>.app/Contents/Resources/app`
   - Linux: `<runtime>/resources/app`
   - macOS 手写 runtime 组装时，还要把 `Contents/MacOS/Electron` 改成产品可执行文件名，并同步 `Info.plist` 的 `CFBundleExecutable`；否则外壳虽然叫产品名，Electron 仍可能把自己识别成默认 runtime。
5. macOS 如果要接自定义图标，把 `.icns` 放入 `<App>.app/Contents/Resources/`，并在 `Info.plist` 写 `CFBundleIconFile`。
6. macOS 如果要产出 `.dmg`，用同一个最终 `.app` 建一个临时目录，目录内放 `<App>.app` 和指向 `/Applications` 的 symlink，再用 `hdiutil create -srcfolder ... -format UDZO` 生成压缩磁盘映像。
7. release manifest 明确标注 `signed: false` 和 `notarized: false`，并分别记录 archive / dmg artifact，避免把本地安装介质误认为正式签名分发包。
8. 如果要做本地“点击更新”，不要让运行中的 app 覆盖自己。由 main 进程验证源码目录和安装目标，写一个外部 helper 到 `<userData>/tmp/`，helper 负责构建、等待当前 pid 退出、替换 `.app`、再 `open` 新 app。

## 容易踩的坑

- `pnpm deploy` 在 pnpm 10 默认要求 injected workspace；不满足时需要 `--legacy`。
- 离线或受限网络环境下，deploy 可能尝试访问 registry；如果依赖 store 已就绪，可用 `--offline` 让失败更早暴露。本地打包脚本可以先试 `--offline`，失败后清理 deploy 目录并退回普通 deploy，这样首次打包能自动补齐 pnpm store。
- 没有 `files` 白名单时，workspace package 可能把 `src`、测试和配置也放进 release app resources。
- TypeScript 的 main/preload 构建可能输出测试目录或 `.map` / `.d.ts`；如果不想改编译边界，可以在 release 脚本里做 release-only prune。
- `pnpm ci` 在 pnpm 10 会命中 pnpm 自己尚未实现的内置命令；要执行 package script，应写成 `pnpm run ci`。
- `.dmg` 只是安装介质，不等于签名或 notarization。没有 Developer ID 时，本地 app 仍可能触发 macOS “无法验证开发者”的提示，需要右键打开或在系统设置中允许。
- 图标必须在签名或去签名前写入 `.app`，否则先签名再改资源会让签名失效。
- `iconutil` 对 `.iconset` 很挑剔；如果本机 PNG 元数据导致转换失败，可以先保留规范尺寸的 iconset，再用 ICNS 容器格式生成最终 `.icns`，但要用 `file` 或真实 app 打包验证。
- 应用内“点击更新”不是 `.dmg` 自动带来的能力。运行中的 app 不能可靠覆盖自己，本地 updater 需要外部 helper 或脚本执行“退出 app -> 替换 app -> 重启 app”。
- 手写 Electron portable 包时，`app.isPackaged` 可能因为主可执行文件仍叫 `Electron` 而不可靠。本地 updater 应以真实 `.app` 路径和安全边界为主，例如允许 `Actspace.app` / `actspace.app`，但拒绝 `node_modules/electron/dist/Electron.app`。
- 本地 updater 需要把“能执行什么”固定在 main 进程：renderer 只触发 `start`，不能传 shell 命令；main 校验 source root 是预期 repo 后再生成 helper 脚本。否则更新按钮会变成任意命令执行入口。
- 替换 `.app` 前最好先把旧 app 移到同目录 backup，复制新 app 失败时恢复 backup；成功重启后再清理 backup。这样比直接 `rm -rf "$APP_PATH" && cp -R` 更容易从中途失败恢复。

## 什么时候该升级工具链

这个模式适合 Phase 2：先让 release 产物代表真实应用。等需要签名、notarization、dmg/installer、自动更新、多平台 matrix 和更完整的 app metadata 时，再引入专门的 Electron 打包工具更合适。
