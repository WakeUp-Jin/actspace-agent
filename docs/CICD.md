# CI/CD 说明

`actspace` 当前仍沿用模板时期的 CI/CD 骨架，但已经开始接真实项目命令。常驻 CI 已经分成仓库基础门禁和 workspace 工程门禁两层。

## 当前包含的内容

- `ci.yml`：常驻 CI，覆盖 docs、repo hygiene、GitHub Actions pinning、Markdown、shell 脚本校验，以及 workspace 的依赖安装、类型检查、测试和构建。
- `supply-chain-security.yml`：在 PR 上做依赖变更检查，并在 PR、定时任务和手动触发时运行 OSV 扫描。
- `release.yml`：手动触发的 release 流水线，用来打包 unsigned portable 桌面制品、生成 SBOM/provenance，并创建 GitHub Release。

当前根命令还包括：

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm package:desktop`
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

该命令会在 `dist/` 生成当前平台的 desktop archive；macOS 上还会生成 `actspace-desktop-darwin-<arch>.dmg`。打开 `.dmg` 后把 `actspace.app` 拖到 Applications 即可本地安装。macOS 上没有 Developer ID 证书时，脚本默认不签名，并会移除外层 app 继承自 Electron runtime 的旧签名，避免修改资源后留下失效签名。这适合源码本地构建和开发验证，不等于面向公众分发所需的 Developer ID 签名和 notarization；首次打开时系统可能提示无法验证开发者，需要右键打开或在系统设置里允许。`pnpm deploy` 会先尝试 `--offline`，如果本机 pnpm store 缺少 tarball，再自动退回普通 deploy 以补齐缓存。

已安装的 macOS app 还提供设置页「通用 → 本地更新」入口，服务本地自用：用户选择本机 actspace 源码目录后，应用会从该目录运行 `pnpm package:desktop:dmg`，等待当前 app 退出，替换当前 `.app`，然后重新打开。该能力不拉取远程代码、不做版本比对，也不等同于正式自动更新；它依赖本机源码目录、pnpm 环境和当前安装位置可写。

所有 GitHub Actions 仍然保持 pin 到 commit SHA。后续升级 action 时，也要继续保持这个约束。

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
- `ACTSPACE_MAC_ADHOC_SIGN=true`：显式尝试 ad-hoc signing；这是本地临时签名，不提供开发者身份背书。
