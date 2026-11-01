# S4 README 与文档

## 目标

打开 `packages/README.md` 就能看懂整个包结构：有哪些能力目录、各管什么、谁依赖谁、怎么新增一个插件。打开任何一个能力目录的 README，就能知道里面有哪些包、各管什么、怎么连起来。有脚本保证 README 跟代码不脱节。现行文档里不再出现旧路径和旧包名。

## 范围

- 包含：
  - `packages/README.md` 总地图；
  - 23 份能力目录 README；
  - `scripts/check-package-readmes.mjs` 及其测试；
  - 现行文档的路径与包名同步。
- 不包含：
  - 包内部的 README（`packages/<能力>/<包>/README.md`）。已有的保留，路径和包名改对；没有的不新建。
  - 历史文档。

## 必读

- [02 插件结构设计](../../../design-docs/架构优化/02-插件结构设计.md) §3、§8、§11
- 参照写法：DSH 的 `tmp/deepseek-harness/packages/README.zh.md`、`tmp/deepseek-harness/packages/shell/README.zh.md`。只参照结构，不照抄内容。
- `docs/DOCS_STYLE.md`（如存在）或仓库现行文档的写作习惯：中文、短句、先结论。

## 步骤

### 1. 总地图

重写 `packages/README.md`，frontmatter 与内容照设计 §8.1：

- 组织规则：两级、目录名即包名、命名表、归属规则。
- 能力目录表：23 行，列为目录、职责、包数、类别、链接。
- 依赖方向：一张文字图。
  - `util` ← `composition` ← `core` ← 各能力 ← `host`；
  - 能力之间只依赖接口包（例如 `tool-shell` 依赖 `sandbox` 而不是 `sandbox-seatbelt`）；
  - `apps/*` 不被包依赖；
  - `test-support` 只进测试。
- 新增插件的五步。
- 检查命令。

### 2. 能力目录 README

每个能力目录写一份 `README.md`，frontmatter 与内容照设计 §8.2。包表的类别和默认开关从插件清单抄，写完由步骤 3 的脚本核对。

- 已有 README 的目录（如 `session/`、`sandbox/`、`context/`、`llm/`）：在原内容上按规范重写，保留仍然正确的说明。
- 原来散在第一级包里的 README（如 `packages/boot/README.md`，S1 后在 `packages/composition/boot/README.md`）保留为包 README。目录 README 里链接过去，不合并。
- “包之间怎么连”一节写 provides / inject 关系。以 manifest 为准，不凭印象写。写之前先跑 `pnpm gen:contract-matrix`，对照生成矩阵。

23 个目录：`core`、`session`、`llm`、`context`、`fs`、`shell`、`web`、`image`、`todo`、`background-tasks`、`subagent`、`sandbox`、`approval`、`harness-evolution`、`composition`、`host`、`client`、`side-chat`、`browser`、`english-learning`、`skill`、`util`、`test-support`。

### 3. 检查脚本

新文件 `scripts/check-package-readmes.mjs`，规则照设计 §8.3。

- 解析包表时，以表头含「包」和「类别」的第一张 Markdown 表为准。
- 类别对照读 `@actspace/runtime` 构建产物里的 `PLUGIN_CATALOG`：
  - `loaders` 含 `host` 的为「全局」；
  - 只含 `harness` 的为「会话」；
  - 不在清单里的为「库」；
  - 在 `PLUGIN_PACKAGES_OUTSIDE_DEFAULT` 里的，写「库」或「不在默认组合」都可以。
- `scripts/check-docs.sh` 末尾调用它。
- 测试 `scripts/test/package-readmes.test.mjs`：用临时目录构造四种失败（缺 README、包没列、多列了不存在的包、类别不对）和一种通过；根 `package.json` 增加 `test:package-readmes`，并加进 `test`。

### 4. 现行文档同步

- 写一次性脚本 `tmp/s4-docs.mjs`（不进 git），映射表与 S1 相同，替换 `docs/` 下现行文档里的旧路径和旧包名。
  - 跳过 `docs/exec-plans/completed/`、`docs/histories/`、`docs/exec-runs/`、`docs/learnings/`。
  - 本计划和功能减法计划里描述“原路径”的表格也跳过。
- 手改的文档：
  - `AGENTS.md`、`README.md`、`CONTRIBUTING.md`：包结构说明改为指向 `packages/README.md`。
  - `docs/ARCHITECTURE.md`：包结构一节，加两类插件和插件清单的说明。
  - `docs/design-docs/agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md`：目录规则改为两级结构，链接设计 02。
  - `docs/design-docs/agent-plugin-runtime/README.md` 以及讲 `cordis.yml`、Harness 条目的各篇：写明“由插件清单生成”。
- `scripts/check-current-docs.mjs` 的禁用模式里，增加旧包名（`@actspace/tools-`、`@actspace/core-agent`、`@actspace/core-scope`、`@actspace/session-jsonl`），`allowHistoricalLine: true`。

## 验证

- README「统一验证命令」+ `pnpm test:package-readmes`。
- 故意在某个目录 README 删一行包、改错一个类别，`pnpm check:docs` 报错；改回后通过。
- 人工读一遍：只看 `packages/README.md` 和任意三个能力目录 README，能回答“新加一个沙箱后端放哪、要改哪些地方”。

## 风险

- README 写成凭印象的描述，与代码不符。缓解：包表和类别由脚本核对；连接关系对照生成矩阵写。

## 回滚

`git revert` 本提交。
