## [2026-11-16 20:30] | Task: DeepSeek 深度搜索与文档解析收尾

### 用户诉求

> PR #110 合并后收个尾。

### 做了什么

- **CodeQL**：#110 合并前有两条高危告警（ReDoS），来自去掉路径末尾分隔符的正则。`displayName` 和 `lastSegment` 改成一次 split 取最后一个非空段，行为不变，告警关闭（b11af3ec）。
- **计划**：`20261114-deepseek-deep-search-document-parsing` 整个目录删除，`exec-plans/README.md` 里对应一行去掉。
- **demo**：`deep-search-and-document-demo.html` 删除；`frontend/README.md` 的 demo 清单改成四份；`deep-search.css` 注释不再指向它。
- **设计文档**：标题去掉「目标设计，未实现」，开头改成已实现；`design-docs/index.md` 同步。

### 未验证与遗留

- 真实应用里的统一验收（深度搜索 7 项、文档解析 12 项）按 PR #110 描述里的清单做，结果不在本记录里。
- 老格式 `.doc` / `.ppt` 没有用真实接口测过；验收读不了就从支持列表里去掉。
- 深度搜索来源列表展开后最高 280px，只露出前 3 条，是否改成全部铺开待看过再定。
- 真实设置里 `deepseekDeepSearchEnabled` 是打开的；真实数据里有两个测试会话（281153a3、387cfd9d），待用户决定是否删除。
- 用户给过的 DeepSeek Key 需要轮换。

### 涉及文件

- `docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md`
- `docs/design-docs/index.md`
- `docs/design-docs/frontend/README.md`
- `docs/exec-plans/README.md`
- `apps/desktop/src/renderer/styles/deep-search.css`
