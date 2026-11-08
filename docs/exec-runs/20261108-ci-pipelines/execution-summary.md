# CI 重新上线与桌面发布流水线 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261108-ci-pipelines.md`
- **执行过程**：`docs/exec-runs/20261108-ci-pipelines/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成（P1–P3 完成；P4、P5 另开 PR）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| managed CLI 打包重试前清空 deploy 目录 | `scripts/package-agent-cli.mjs` | 离线 deploy 失败会留半成品目录，pnpm 拒绝往非空目录 deploy，重试必败。 |
| desktop 测试与开发机解耦 | `apps/desktop/src/main/test/remote-host-registry.test.ts`、`surface-derived-equivalence.test.ts`、`apps/desktop/src/renderer/test/turn-tail.test.tsx`、`setup.ts` | 补 `safeStorage` mock、固定时区、更新文案、隔离全局 git 配置（`core.fsmonitor` 会让 git 调用等 20–30 秒）。 |
| `agent-cli-safety` 跟上后台任务重启语义 | `scripts/test/agent-cli-safety.test.mjs` | resume 先交付 `lost` 通知的 Run 再跑新任务；旧命令仍不重放。`main` 上同样失败，之前被打包失败挡住。 |
| `check-package-cutover` 去误报 | `scripts/check-package-cutover.mjs` | 相对导入里的 `plugins/` 与测试文件里的退役名不再算 finding，`--strict` 在干净 `main` 上 0 findings。 |
| 工作流分层 + 并发 + 缓存 | `.github/workflows/ci.yml`、`docs.yml`、`agent-cli-binaries.yml`、`supply-chain-security.yml` | PR 几分钟内拿到五个并行 job 的结果；纯文档 PR 只跑 `docs.yml`；`main` 上额外做 Linux 打包冒烟；同一 PR 连续推送只保留最后一次。 |
| markdownlint 可用 | `.markdownlint.json`、`.markdownlint-cli2.jsonc`、13 份 Markdown | 排除第三方 skill / history / fixture，关掉纯排版规则，修掉 45 处真实问题。 |
| 依赖安全 | `apps/desktop/package.json`、`packages/llm/llm-service/package.json`、`pnpm-lock.yaml` | `dompurify` 3.4.17、`undici` 7.30.2，清掉 `pnpm audit --prod` 的 moderate / high。 |
| Dependabot + CodeQL | `.github/dependabot.yml`、`.github/workflows/codeql.yml`、`.github/codeql/codeql-config.yml` | 每周一分组开依赖 PR；JS/TS 与 Actions 的静态安全分析。 |
| 文档 | `docs/CICD.md`、`docs/exec-plans/README.md`、`docs/exec-plans/tech-debt-tracker.md` | 费用前提、工作流表、重新启用步骤、分支保护提醒、技术债登记。 |
| P4 桌面发布矩阵（第二个 PR） | `.github/workflows/release.yml`、`scripts/release-package.sh`、`scripts/package-browser-components.mjs`、`docs/CICD.md` | `v*` tag 触发 macOS arm64 / x64、Linux、Windows 四平台打包 + provenance，汇总 SBOM 与合成 manifest 后建草稿 Release；tag 与包版本一致性校验；打包脚本 PR 自动四平台 dry-run；Windows portable zip 分支。 |

## 人工验证指引

### 必须验证

1. **重新启用工作流**
   - 验证方式：合并后到仓库 **Actions** 页，左侧依次点 `CI`、`供应链安全`、`发布`，在页面顶部横幅点 **Enable workflow**。
   - 预期结果：三个工作流不再显示「This workflow was disabled manually」。

2. **`main` 上一次完整运行**
   - 验证方式：合并本 PR 后看 `CI` 在 `main` 上那次运行。
   - 预期结果：五个 job 全绿；`build` job 的「桌面打包冒烟」步骤生成 `dist/actspace-desktop-linux-x64.tar.gz`；总耗时在 10 分钟上下（CodeQL 单独计）。

3. **CodeQL 首次结果**
   - 验证方式：合并后看 `CodeQL` 工作流运行时间，以及 **Security › Code scanning**。
   - 预期结果：有 `javascript-typescript` 和 `actions` 两组结果；若单次超过 20 分钟，按计划把 `pull_request` 触发去掉只留 `main` 与定时。

4. **P4：第一个草稿 Release**（合并第二个 PR 后）
   - 验证方式：确认 `apps/desktop/package.json` 版本是要发的版本，`git tag v<版本> && git push origin v<版本>`，等 `发布` 工作流跑完，到 Releases 页看草稿。
   - 预期结果：草稿挂着 `darwin-arm64` / `darwin-x64` 的 tar.gz + dmg、`linux-x64` tar.gz、`windows-x64` zip、`release-manifest.json`、`sbom.spdx.json`；每个 archive 在 Actions 的 `package` job 里有 attestation 步骤成功。检查完点 Publish，或删草稿重来。

5. **P4：Windows 包能启动**
   - 验证方式：在 Windows 机器上解压 `actspace-desktop-windows-x64.zip`，运行 `ActSpace.exe`，跑一轮聊天和一次工具调用。
   - 预期结果：应用启动、工具调用正常；SmartScreen 提示属预期（未签名）。任何异常记到 `tech-debt-tracker.md`「Release / Windows」行。

### 建议验证

1. **分支保护**
   - 验证方式：Settings › Branches 看 `main` 的 required checks。
   - 预期结果：只有 `仓库检查`（`repository-checks`）/ `文档检查`（`docs-checks`）被设为必需；不要把 `typecheck-test`、`build` 等带路径过滤的 job 设为必需。

2. **Dependabot 首批 PR**
   - 验证方式：下周一上午看 Pull requests。
   - 预期结果：至多 5 个 npm PR（`dev-dependencies`、`runtime-minor-patch` 两个分组 + 可能的 major 单独 PR）、一个 Actions PR、一个 Go PR。

## Agent 已完成的验证

- `./scripts/ci.sh`：通过（docs 校验、hygiene、action pinning、shell 语法）。
- `pnpm run test:package-cutover` 与 `node scripts/check-package-cutover.mjs --strict`：通过，0 findings。
- `actionlint .github/workflows/*.yml`：通过。
- `npx markdownlint-cli2@0.20.0 "**/*.md"`：1106 文件 0 错误。
- desktop 测试：2800 通过；1 个既有失败是开发机 nvm 告警导致（见遗留）。
- `GOTOOLCHAIN=go1.26.10 ./scripts/release-package.sh`（Linux）：生成 tar.gz，`DONE-0`；P4 改动后复跑，产物名不变、manifest 变为 `release-manifest-linux-x64.json`。
- P4：`actionlint .github/workflows/release.yml`、`scripts/check-action-pinning.sh` 通过；四平台 dry-run 结果见第二个 PR 的检查。
- `pnpm audit --prod`：只剩 `katex` 一条 low。
- `pnpm test:agent-cli:process`：19/19，safety 用例连跑三次稳定。
- PR 上 GitHub 实际运行：CodeQL 两种语言均通过（JS/TS 1 分 41 秒），`文档`、`Agent CLI managed package` 在补 ripgrep 与更新 safety 断言后复跑。

## 已知风险和遗留事项

- 产品侧 `runGitCommand` 对开启 `core.fsmonitor` 的用户仓库可能等 20–30 秒，本轮只修了测试侧；见 `tech-debt-tracker.md`「CI 与工程化遗留」。
- `runtime-v2-output-reference-flow.test.ts` 在装了 nvm 的开发机上会失败（行数断言被 shell 告警撑多两行），runner 上不受影响。
- P4 的 Windows 包没有图标 / 版本资源 / Authenticode，也没人实机运行过；完整产物经 Actions artifact 中转（每个 tag 约 700 MB，保留 1 天）。都记在 `tech-debt-tracker.md`「CI 与工程化遗留」。

## 后续建议

- P5：Electron 39 → 当前稳定大版本，跑完整 desktop 测试与实机走查。
