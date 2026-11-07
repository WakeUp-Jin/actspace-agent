# 左侧会话栏验收矩阵（归档）

从 `front-左侧会话栏规范.md` 迁出的验收清单；现行规则见该规范。

- Workspace 文件夹：图标格和名称点击折叠，折叠状态重启保留；右键、`⋯`、`Shift+F10` / Context Menu 键打开菜单；右侧 `+` 只新建 Agent。
- 视图选项：三种分组、两种排序、三种归档筛选和恢复默认都生效并持久化；按时间时手动排序禁用；拖拽只在同一账本内，「最近更新」下拖动后切到手动排序并提示。
- 搜索：放大镜展开搜索框，结果替换列表，`Esc` 关闭后恢复原列表。
- 菜单：顺序、图标、separator、danger 文字、键盘方向键、Escape 回焦和窗口 collision 正常。
- 在 IDE 中打开：只打开 registry 对应目录；未注册、已隐藏、不存在和非目录目标都不启动外部程序。
- 归档全部：包含 Pinned 会话；存在 running / waiting approval 会话时禁用；active session 有导航落点；部分失败保留未成功条目。
- 从侧栏移除：同时移出 Workspaces / Pinned；所有 Workspace 都可移除；重启不回流；重新选择同路径恢复；全部移除后新建会话页提示「请先选择工作区」。
- 会话 Tooltip：所有行可 hover / focus，只显示完整标题与绝对路径；锚点用完整会话行，浮层左边缘与 Sidebar 右侧分割线保持 8px；右键菜单和重命名时关闭。
- 主题：浅色、深色和 system-dark 下不使用非主题感知颜色，focus / disabled / danger 状态可辨识。

## 已退役或已删除的口径

- Kairos、Lab 不属于公开导航；没有定时任务能力，不展示 `Scheduled` 占位分区。
- rail（60px icon-only）模式退役，localStorage 旧值 `leftMode: "rail"` 反序列化为 `hidden`。
- 旧版「默认工作区」兜底分组已移除；既无 `workspaceRoot` 又匹配不到已登记工作区的本地会话不显示。
