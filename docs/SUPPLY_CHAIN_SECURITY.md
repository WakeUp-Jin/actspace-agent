# 供应链安全

这份文档定义模板默认采用的供应链安全做法。

## 默认控制项

- 在 Pull Request 上做依赖变更审查；当前配置为 `warn-only: true`，用于先暴露风险，不阻断合并。
- 在 PR、定时任务和手动触发时，用 OSV 对仓库中的依赖声明和 lockfile 做漏洞扫描。
- 为 release 产物生成 SBOM。
- 为 release 产物生成 build provenance attestation。
- 所有 GitHub Actions 都固定到不可变的 commit SHA，而不是漂移的版本标签。

## 当前对应关系

- `actions/dependency-review-action`：审查 PR 中的依赖变更。当前 `.github/dependency-review-config.yml` 设置了 `warn-only: true`，因此高风险变更只告警、不阻断；要升级为硬门禁时需先移除该配置。
- `google/osv-scanner-action`：根据仓库里的依赖文件扫描已知漏洞。
- `anchore/sbom-action`：生成 SPDX 格式的 SBOM。
- `actions/attest-build-provenance`：为 release artifact 生成签名 provenance。
- `scripts/check-action-pinning.sh`：如果 workflow 里出现浮动 tag 而不是 SHA，直接让 CI 失败。

## 限制和前提

- Dependency Review 在 public repo 可以直接使用；private repo 通常需要 GitHub Advanced Security 或对应的代码安全能力。
- OSV 和 SBOM 的效果依赖仓库里存在可识别的依赖清单或 lockfile。
- 当前 `scripts/release-package.sh` 已经生成 portable 桌面应用 archive；provenance 会指向该真实 release artifact，但它仍不等于 Developer ID 代码签名或 notarization。默认无证书 macOS 产物会移除外层 app 旧签名，避免携带失效签名；ad-hoc signing 仅作为显式 opt-in 的本地临时签名，不提供开发者身份背书。
- OpenSSF Scorecard 默认不启用，因为新模板仓库还没有真实分支保护、release 历史和 SAST 姿态可以评分；等仓库规则配置完成后再按需加回。

## 项目落地后建议继续做的事

- 锁定并提交项目真实依赖的 lockfile。
- 让构建过程尽量可重复、可验证。
- 如果条件允许，在部署链路里增加对 provenance 的校验。
- 把 attestation 校验继续下沉到部署平台或准入层。
