# 官网 V5：文档、博客与更新日志改版 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261025-site-v5-docs-blog-updates.md`
- **执行过程**：`docs/exec-runs/20261025-site-v5-docs-blog-updates/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成，用户视觉验收通过

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Markdown 构建期插件与自有高亮主题 | `src/lib/markdown/*.mjs`、`astro.config.mjs` | 生成 figure、提示块、代码卡、标题编号、中英空格，文档和博客共用 |
| 文档 A4 小舞台 | `layouts/DocsLayout.astro`、`styles/docs.css` | 三栏布局、标题舞台、上一篇 / 下一篇、页内目录高亮 |
| 博客列表 Q2 | `pages/blog/index.astro`、`styles/blog.css`、`lib/blog-presentation.ts` | 封面关键词 + 角色插画，只列标题，分类单选 |
| 博客详情 R3 + M2 | `pages/blog/[...slug].astro`、`styles/blog-article.css` | 封面色头部、M2 正文、上一篇 / 下一篇卡片 |
| 更新日志 U1 | `components/updates/UpdateTimeline.astro`、`pages/updates/index.astro`、`styles/updates.css` | 月份 + 时间轴 + 类型筛选 |
| 代码复制 | `scripts/code-copy.ts` | 替代 `docs-copy.ts`，文档和博客共用 |
| 删除旧件 | `editorial.css`、`prose.css`、`blog-sort.ts`、`docs-copy.ts`、`global.css` 中的 changelog 规则 | 已被新样式和脚本替代 |

功能减少（用户确认 Q2 / A4 时已认可）：

- 博客：删除搜索、排序、视图切换和文章分享 / 复制链接按钮。
- 文档：不做「这页有帮助吗」。

## 自动验证结果

- `pnpm --filter @actspace/site check`：0 errors / 0 warnings / 0 hints。
- `pnpm --filter @actspace/site test`：5 个文件，31 项全部通过。
- `pnpm --filter @actspace/site build`：生成 46 页。
- 390 宽 iframe 探针：以下页面均满足 `scrollWidth == clientWidth`：
  - `/docs/bash/`、`/docs/configure-a-model/`
  - `/blog/`、`/blog/write-and-edit/`、`/blog/agent-team-and-agent-room/`
  - `/updates/`
- 交互探针：

  | 检查项 | 结果 |
  |---|---|
  | 博客「全部」 | 显示 11 篇 |
  | 博客「多智能体」 | 显示 1 篇，且是头条；地址同步为 `?category=` |
  | 博客分类直达链接 | 显示 7 篇 |
  | 更新日志「全部」 | 70 条 |
  | 更新日志「修复」 | 33 条，分布在 6 个月 |
  | 复制按钮 | 文章页 11/11、CLI 文档 4/4 已显示 |
  | 文档页内目录 | 有 1 项高亮 |
  | 文档上一篇 / 下一篇 | 2 个链接 |
  | 移动端文档目录 | 默认折叠 |

## 人工验证指引

### 必须验证

1. **三处页面对照原型**
   - 验证方式：打开 `http://127.0.0.1:8765/actspace-agent/` 下的 `/docs/bash/`、`/blog/`、`/blog/write-and-edit/`、`/updates/`，与 `docs/design-docs/site-v5/demos/` 中对应的原型对照。
   - 预期结果：文档是 A4 小舞台，博客列表是 Q2，文章是 R3 头部 + M2 正文，更新日志是 U1 时间轴。
2. **复制功能**
   - 验证方式：在真实浏览器里点代码卡「复制」和文档「复制页面」，再粘贴。
   - 预期结果：按钮显示「已复制」，剪贴板内容正确。headless 无法验证剪贴板。

### 建议验证

1. **中文锚点**
   - 验证方式：打开 `/docs/what-is-actspace/#产品理念`。
   - 预期结果：定位到对应标题。
2. **手机宽度**
   - 验证方式：在真机或 DevTools 390 宽下查看文档目录折叠、博客单列和文章头部。
   - 预期结果：没有横向滚动。

## 遗留事项

- 计划已移入 `completed/`。
- 真实浏览器里的剪贴板复制尚未单独验证。
