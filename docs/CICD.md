# CI/CD 说明

`actspace` 当前仍沿用模板时期的 CI/CD 骨架，但已经开始接真实项目命令。常驻 CI 已经分成仓库基础门禁和 workspace 工程门禁两层。

## 当前包含的内容

- `ci.yml`：常驻 CI，覆盖 docs、repo hygiene、GitHub Actions pinning、Markdown、shell 脚本校验，以及 workspace 的依赖安装、类型检查、测试和构建。
- `supply-chain-security.yml`：在 PR 上做依赖变更检查，并在 PR、定时任务和手动触发时运行 OSV 扫描。
- `release.yml`：手动触发的 release 流水线，用来打包 unsigned portable 桌面制品、生成 SBOM/provenance，并创建 GitHub Release。
- `site-pages.yml`：在 `main` 更新或手动触发时构建 `packages/site`，上传静态产物并部署到 GitHub Pages。

当前根命令还包括：

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm package:desktop`
- `pnpm dev:site`
- `pnpm check:site`
- `pnpm test:site`
- `pnpm build:site`
- `pnpm run ci`

## 当前现状说明

- `scripts/ci.sh` 当前只做仓库级基础检查：
  - docs 校验
  - repo hygiene
  - GitHub Actions pinning
  - shell 脚本语法检查
- `.github/workflows/ci.yml` 中的 `workspace-checks` job 会：
  - 用 Corepack 读取根 `package.json` 的 `packageManager` 字段并启用对应 pnpm 版本。
  - 执行 `pnpm install --frozen-lockfile`。
  - 执行 `pnpm typecheck`、`pnpm test`、`pnpm build`。
  - 显式执行站点的 `check:site`、`test:site` 和 `build:site`，并使用 GitHub project Pages 的 `/actspace-agent` base path 验证生产构建。
- workspace 依赖当前允许 `electron` 和 `esbuild` 执行构建脚本；否则 Electron 开发启动无法正确安装运行时。
- 当前桌面端优先跟随较新的稳定 Electron 版本，以降低 macOS 26 这类新系统上的启动兼容风险。
- `packages/desktop` 的开发启动依赖 `packages/shared` 和 `packages/agent-core` 的可消费构建产物；如果包边界被改回源码直引，Electron 启动链会再次失稳。
- `scripts/release-package.sh` 会先构建 desktop workspace，再用当前平台的 Electron runtime 组装 portable desktop archive；默认不需要付费证书，也不会强制签名。

也就是说，这套 CI/CD 现在已经不再是纯模板：默认 CI 已经能守住真实 TypeScript workspace 的基础健康；release 也已经开始产出真实桌面应用 archive。macOS release 会额外产出本地安装用 `.dmg`，但当前 release 不强依赖 Developer ID 证书，仍不包含正式 notarization 或自动更新。

开源用户可以直接从源码本地打包：

```sh
pnpm install
pnpm package:desktop
# macOS 上也可以用这个更直观的别名；它和 package:desktop 走同一条 release 脚本。
pnpm package:desktop:dmg
```

该命令会在 `dist/` 生成当前平台的 desktop archive；macOS 上还会生成 `actspace-desktop-darwin-<arch>.dmg`。打开 `.dmg` 后把 `Actspace.app` 拖到 Applications 即可本地安装。macOS 上没有 Developer ID 证书时，脚本默认不签名，并会移除外层 app 继承自 Electron runtime 的旧签名，避免修改资源后留下失效签名。这适合源码本地构建和开发验证，不等于面向公众分发所需的 Developer ID 签名和 notarization；首次打开时系统可能提示无法验证开发者，需要右键打开或在系统设置里允许。源码本地自用时也可以运行 `ACTSPACE_MAC_ADHOC_SIGN=true pnpm package:desktop:dmg` 生成本地临时签名产物；该模式只用于降低自构建使用摩擦，仍不提供开发者身份背书。`pnpm deploy` 会先尝试 `--offline`，如果本机 pnpm store 缺少 tarball，再自动退回普通 deploy 以补齐缓存。

macOS 产物会把复制来的 Electron runtime 改成 Actspace 语义：外层 bundle 为 `Actspace.app`，主可执行文件为 `Contents/MacOS/Actspace`，`Info.plist` 的 `CFBundleExecutable` 也同步指向 `Actspace`。这让本地构建的应用更接近标准 macOS app，并减少 Electron 默认 runtime 名称带来的 `app.isPackaged`、钥匙串和系统识别混乱。

已安装的 macOS app 还提供设置页「更新 → 本地更新」入口，服务本地自用：用户选择本机 actspace 源码目录后，应用会从该目录运行 `pnpm package:desktop:dmg`，构建阶段保持当前 app 打开并显示阶段进度。本地 updater 构建默认启用 `ACTSPACE_MAC_ADHOC_SIGN=true`，但不会覆盖用户显式提供的 Developer ID 签名或 ad-hoc 配置；helper 会在退出当前 app 前验证新 `.app` 的 bundle 元数据、主可执行文件和 code signature。验证通过并写出 `ready_to_replace` 后，main 进程才退出当前 app，helper 随后替换 `.app` 并重新打开；如果复制或打开新 app 失败，helper 会尝试恢复旧版本。该能力不拉取远程代码、不做版本比对，也不等同于正式自动更新；它依赖本机源码目录、pnpm 环境和当前安装位置可写。updater 通过当前进程路径解析真实 `.app` 安装目标，并拒绝 `node_modules/electron/dist/Electron.app` 这类开发 runtime；不要只用 Electron 的 `app.isPackaged` 作为本地安装判定。

所有 GitHub Actions 仍然保持 pin 到 commit SHA。后续升级 action 时，也要继续保持这个约束。

## 官网部署

官网是 `packages/site` 下的 Astro 静态站点。默认公开地址为：

```text
https://wakeup-jin.github.io/actspace-agent/
```

`site-pages.yml` checkout 完整 monorepo，因为更新页在构建时会读取根目录 `docs/releases/feature-release-notes.md`。Astro 官方 Action 从仓库根目录安装 pnpm workspace 依赖，再运行 `pnpm build:site`，上传 `packages/site/dist`，只有 build job 成功后 deploy job 才会发布。

仓库维护者仍需在 GitHub 的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。Workflow 不能代替这项仓库设置。

默认构建环境为：

```sh
SITE_URL=https://wakeup-jin.github.io SITE_BASE=/actspace-agent pnpm build:site
```

未来切换自定义域名时，设置 `SITE_URL=https://<domain>` 和 `SITE_BASE=/`，并在域名确定后再添加 `packages/site/public/CNAME`。组件内部链接统一经过 base path helper，不需要逐页修改。

首版不接第三方统计、遥测或运行时后端。站点发布与桌面 release 使用独立 workflow，Pages 失败不会创建或修改桌面 GitHub Release。

## 下一步推荐

1. 继续保留 `repository-checks` 和 `workspace-checks` 两层 CI，避免仓库卫生与工程构建互相遮蔽失败原因。
2. 后续如需加 Node setup / pnpm setup action，必须继续 pin 到 commit SHA，并同步更新 `scripts/check-action-pinning.sh` 能识别的 workflow 约束。
3. 后续如需多平台 release，先把 `release.yml` 拆成 macOS/Linux runner matrix，并让 provenance 覆盖每个平台产物。
4. 如果后续接 installer、Developer ID 签名、notarization、远程自动更新，再在现有 release 流水线上扩展。

## 默认 release 产物

当前 release 流水线仍会产出：

- `release-manifest.json`
- `actspace-desktop-<platform>-<arch>.tar.gz`
- macOS: `actspace-desktop-darwin-<arch>.dmg`
- `sbom.spdx.json`
- 对 release artifact 生成的 GitHub artifact attestation

`release-manifest.json` 会标明产物平台、架构、archive / dmg 大小，以及 `signed`、`notarized`、`signature`。`signature: "ad-hoc"` 代表本地临时签名，不是 Developer ID 分发签名。这说明当前交付链路已经从仓库元数据包推进到真实桌面应用 archive 和 macOS 本地安装介质，但仍不是正式签名分发包。

## 可选 macOS 签名接口

release 脚本默认不要求证书；只有显式提供环境变量时才启用 Developer ID 签名或 notarization：

- `ACTSPACE_MAC_CODESIGN_IDENTITY`：Developer ID Application 证书名称。存在时脚本会执行 `codesign --options runtime --timestamp`。
- `ACTSPACE_MAC_NOTARIZE=true`：启用 notarization；需要同时提供 Developer ID 签名。
- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`：notarytool 所需凭据。
- `ACTSPACE_MAC_ADHOC_SIGN=true`：显式启用 ad-hoc signing；脚本会对主 Electron 可执行文件和外层 `.app` 做本地临时签名，避免递归重签 Electron 内置 framework。这不是 Developer ID 分发签名，不提供开发者身份背书，也不等同于 notarization。
