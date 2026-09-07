# 扩展独立页面与能力命名

## 用户诉求

将设置里的 Skills 和扩展移到侧栏新建按钮下方的「扩展」入口；参考提供的列表式页面，将原扩展改称「能力」，避免与后端 Plugin 概念混淆。方案经用户确认后实施。

## 实现

- Sidebar 新增扩展入口；WorkbenchLayout 增加 extensions 视图并为窗口栏预留顶部空间。保留会话导航，隐藏聊天右栏及其开关，返回聊天恢复草稿和原右栏状态。
- 新增 `components/extensions/ExtensionsPage.tsx`，提供能力、Skills、MCP 分类与按分类搜索；支持键盘方向键及 Home / End 切换。MCP 明确显示暂未接入。
- 原 PluginsSettings / SkillsSettings 移至 extensions 下的 CapabilitiesSection / SkillsSection。Browser Bridge 默认展示摘要与连接状态，展开后使用原安装和诊断流程；保留旧源码路径存储键。
- Skills 保留发现、启停、目录安装和卸载，增加搜索与刷新。保存成功后才切换开关，失败反馈可重试；路径按需展开。
- SettingsNav / SettingsPage 移除两个旧入口。同步设置中心、会话侧栏、工作台布局设计规范。

## 验证

- 桌面现有全量测试：88 文件、621 项通过。
- 新增用例及最终相关回归：扩展页、设置页、侧栏、工作台四文件共 82 项通过，覆盖搜索、键盘分类、保存失败重试、安装卸载、草稿恢复和窄窗导航。
- Desktop typecheck、renderer production build、frontend-theme、check:docs、git diff --check 通过；构建仍有现存大 bundle 提示。
- Computer Use 浏览器：确认实际 renderer 外壳中的侧栏入口、页面切换、窗口栏留白；显式 fixture 检查浅色、深色、跟随系统与 375px / 1280px 排版，修复窄窗详情操作挤压。样例不保存数据。
- Electron 开发进程已启动，但 Computer Use 无法识别工作区开发应用的名称、bundle ID 与路径，真实窗口操作未验收。真实 Browser Bridge 编译安装、Chrome 连接与 Skill 文件增删仍需手动验收，不以 fixture 代替。

## 范围与学习评估

只增量调整已存在的未提交工作，不提交或推送。此轮主要复用已有视图和配置契约，没有同时满足至少两项学习沉淀条件，不另建学习文档。
