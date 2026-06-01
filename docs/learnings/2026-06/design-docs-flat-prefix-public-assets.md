# 扁平前缀索引适合 Agent 读的设计文档

关联 history：`docs/histories/2026-06/20260601-2350-flatten-design-docs.md`

## 是什么

当一个设计文档目录开始出现多层专题目录时，可以把正式 `.md` 文档收敛到一层，用文件名前缀表达领域：`agent-*`、`front-*`、`lab-*`、`core-*`、`fix-*`。图片、HTML prototype、截图等非正式设计文档则放进唯一资产目录 `public/`。

## 为什么需要

目录分层看起来像是在做信息架构，但对 Agent 协作有一个隐性成本：每次定位知识都要先判断目录，再读目录索引，再进入具体文件。随着专题越来越多，旧目录名也会变成历史包袱，例如 `agent-core/`、`frontend-ui/`、`lab/versions/` 同时承载领域、实现包名和阶段状态。

扁平前缀的好处是把“找文件”变成一个线性动作：

```sh
rg --files docs/design-docs
```

文件名本身就暴露主题，入口索引再承担渐进式披露。这样既保留分组语义，也减少导航深度。

## 怎么用

推荐规则：

- 正式设计文档只放在 `docs/design-docs/` 一层。
- 领域用前缀表达，而不是目录表达。
- 每个领域保留一个 `*-index.md`，作为人工友好的入口。
- `public/` 只放资产，不放正式设计文档。
- 迁移后用脚本检查旧路径和断链，不靠肉眼扫。

示例：

```text
docs/design-docs/
  index.md
  agent-index.md
  agent-context-compression.md
  front-index.md
  front-聊天输入框规范.md
  lab-index.md
  lab-v0-experiment-matrix.md
  public/
    front/
      composer-final.png
      usage-statistics-prototype.html
    lab/
      prototype.html
```

## 常见陷阱

- 只移动文件，不重写索引。结果是目录变扁了，但入口文档还在讲旧目录，Agent 读起来会更混乱。
- 资产也全部摊平。PNG 和 HTML prototype 数量一多，会淹没正式设计文档，所以资产需要一个例外目录。
- 机械替换路径时重复加前缀。迁移后必须做路径存在性检查。
- 历史记录里的旧路径有两类：作为历史事实可以保留，作为当前导航必须更新。不要无差别把所有历史语义改成现在时。

## 自检问题

- 运行 `rg --files docs/design-docs` 时，是否不用进入子目录就能看出主要专题？
- 新人或 Agent 从 `docs/design-docs/index.md` 能否知道前缀规则和资产规则？
- 所有当前导航和代码注释中的设计文档路径是否仍能解析到真实文件？
