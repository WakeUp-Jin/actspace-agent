# CI/CD 说明

`actspace` 当前仍沿用模板时期的 CI/CD 骨架，但已经开始接真实项目命令。

## 当前包含的内容

- `ci.yml`：仓库级检查，覆盖 docs、repo hygiene、Markdown 和 shell 脚本校验。
- `supply-chain-security.yml`：在 PR 上做依赖变更检查，并在 PR、定时任务和手动触发时运行 OSV 扫描。
- `release.yml`：手动触发的 release 流水线，用来打包仓库级制品、生成 provenance，并创建 GitHub Release。

当前根命令还包括：

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm ci`

但注意：现在 `.github/workflows/ci.yml` 里的常驻门禁仍主要执行 `./scripts/ci.sh`，还没有把 `pnpm typecheck` 和 `pnpm build` 接进 GitHub Actions。

## 当前现状说明

- `scripts/ci.sh` 当前只做仓库级基础检查：
  - docs 校验
  - repo hygiene
  - GitHub Actions pinning
  - shell 脚本语法检查
- workspace 依赖当前允许 `electron` 和 `esbuild` 执行构建脚本；否则 Electron 开发启动无法正确安装运行时。
- 当前桌面端优先跟随较新的稳定 Electron 版本，以降低 macOS 26 这类新系统上的启动兼容风险。
- `pnpm typecheck` 和 `pnpm build` 已经可以在本地运行通过，但还没接入默认 CI workflow。
- `packages/desktop` 的开发启动依赖 `packages/shared` 和 `packages/agent-core` 的可消费构建产物；如果包边界被改回源码直引，Electron 启动链会再次失稳。
- `scripts/release-package.sh` 仍然主要打包仓库元数据，而不是桌面应用安装包。

也就是说，这套 CI/CD 现在已经不再是纯模板，但仍属于“仓库门禁先行、产品交付后补”的阶段。

所有 GitHub Actions 仍然保持 pin 到 commit SHA。后续升级 action 时，也要继续保持这个约束。

## 推荐接入顺序

1. 保留 `ci.yml`，继续作为默认常驻的仓库基础门禁。
2. 把 `pnpm typecheck` 接进 GitHub Actions。
3. 再把 `pnpm build` 接进 GitHub Actions，确保桌面端骨架不会静默损坏。
4. 用真实桌面应用产物替换 `scripts/release-package.sh`。
5. 如果后续接 installer、签名、自动更新，再在现有 release 流水线上扩展。

## 默认 release 产物

当前 release 流水线仍会产出：

- `release-manifest.json`
- `repo-metadata.tgz`
- `sbom.spdx.json`
- 对 release artifact 生成的 GitHub artifact attestation

这说明当前交付链路更偏“可追溯仓库制品”，还不是“真实桌面应用交付”。
