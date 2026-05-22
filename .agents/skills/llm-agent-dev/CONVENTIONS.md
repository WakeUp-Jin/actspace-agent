# 维护规范

向本 Skill 添加或修改内容时，遵守以下约定。



## 目录结构

- 最多两层文件夹，第三层必须是文件（如 `references/tools/bash-tool.md`）
- `references/` 下有 7 个模块文件夹：`foundations`、`context`、`tools`、`llm`、`agent-runtime`、`practices`、`agent-evaluation`
- 新增内容必须归入已有模块文件夹，不新增顶层文件夹
- 文件夹内文件数量 >= 3 时，添加 `overview.md` 作为导航

## 文档风格

- 文档中不内嵌代码块，通过 `参考代码: examples/xxx.ts` 引用代码文件
- 每个 reference 文件控制在 100-200 行，超过 300 行时加文件内目录
- overview 文件控制在 30-50 行，仅做导航和关系说明
- 使用祈使句式编写指令
- 解释 why（为什么这样设计）而非堆砌 MUST 规则
- 末尾可附简短的"注意事项"，基于实际踩坑经验

## 图片资源

- 存放位置：`assets/` 目录（与 `references/`、`examples/` 同级）
- 命名：kebab-case，以所属模块为前缀（如 `rag-hierarchical-index.png`）
- 在 reference 文件中用相对路径引用：`![描述](../../assets/xxx.png)`

## 代码示例

- 存放位置：`examples/` 目录
- 默认语言：TypeScript（但本 Skill 支持指导任何语言的开发）
- 粒度：核心骨架代码，保留设计模式的完整性，省略业务细节和样板代码
- 命名：短横线命名，与对应的 reference 文件语义对应

## 文件命名

- 英文短横线命名（kebab-case）
- 语义自解释，不打开文件就能推断内容
- 示例：`tool-definition.md`、`context-manager.ts`

## 渐进式披露

内容加载的四个层级：

1. **SKILL.md**：架构总览 + 路由表（始终在上下文中）
2. **overview.md**：模块内各文件的定位和关系（按需加载）
3. **具体 .md 文件**：完整的设计规范（按需加载）
4. **examples/*.ts**：代码骨架（按需加载）

## 新增模块流程

1. 确定归属的模块文件夹
2. 创建 reference 文件（遵循文档风格）
3. 如有对应代码模式，在 `examples/` 添加 TS 示例
4. 更新对应模块的 `overview.md`
5. 如模块文件夹文件数从 2 增长到 3，创建 `overview.md`
