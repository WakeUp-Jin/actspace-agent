# ActSpace packages

这里按领域组织真实 workspace package。一级目录是领域组或运行时基础设施，二级目录是可独立解析的 leaf package。

可运行、打包或部署的产品入口统一位于根目录 `apps/`；`packages/` 不承载 Desktop、CLI 或 Site 应用。

`@actspace/runtime` 只负责 Host-facing boot、Profile/Bundle composition、projection 和 shutdown；领域语义由独立 package 提供。

领域入口：`core/`、`session/`、`llm/`、`context/`、`prompt/`、`tools/`、`subagent/`、`compaction/`、`host/`、`client/`。
