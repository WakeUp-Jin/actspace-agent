# Plugins 插件模式与 fs-watch 文件监听设计文档

- 时间：2026-07-03 16:30（首版），16:45（v2 改版）
- 类型：设计文档（未实施代码）

## 用户诉求（压缩）

Kairos 现有文件监听是简单的轮询快照 + 差集算法。希望把这个能力抽成独立的 Rust 常驻程序（打包为二进制），持续监听并把结果写入文件供 Agent 主动读取；同时以 Skill 形态提供给其它 Agent（监听结果按天写入 references/，SKILL.md 说明用法）。actspace 内"复杂度内置化"：设置页开关即可启用；Kairos 增加 Skill 加载能力但需设置页控制、默认不全量加载；Skill 生态要可视化管理（安装 / 开启 / 禁用）。

## 主要改动

- 首版：新增 `docs/design-docs/agent-sidecar-fs-watch.md`（命名 Sidecar、源码进仓、Kairos 双路径消费）。
- v2 改版（用户确认后）：重命名为 `docs/design-docs/agent-plugins-fs-watch.md`，删除旧文件；`index.md`、`agent-index.md` 同步。

## 关键设计决策（v2 定稿）

- 命名采用 **Plugins（插件）**，对齐 Codex 用户心智；浏览器侧统一称"浏览器扩展"避免撞名。曾评估 Sidecar（过于工程化）与"桥梁"（被 browser bridge 占用），均排除。
- 插件源码**不进本仓库**：独立仓库 `actspace-plugins`（Cargo workspace，一仓多插件）；actspace 只写集成层，两仓唯一耦合是文件契约（事件 JSONL + state.json 心跳，`v` 字段版本化）。
- fs-watch 选 **Rust**：notify crate 原生递归监听 + macOS FSEvents（Go fsnotify 不支持递归、macOS 走 kqueue 句柄爆炸）；browser bridge 维持 Go，语言按事实标准库选择。
- 心跳判定存活（<90s），不用 pid 探活；单实例锁；14 天保留由插件自清理。
- Kairos 消费**只走 Skill catalog 路径**（白名单 `kairos.enabledSkills` 默认空 + allowedRoots 联动），不做 controller 直读观测增量；现有 poll-on-tick 巡检零改动。已知取舍：不保证每 tick 必看，靠 pushy description + rule.md 缓解，漏看成真实问题再补直读路径。
- 设置页两个**分开的**分组：「插件」（安装检测 / 开关 / 运行状态 / 监听目录配置）与「Skills」（全量列表 + 主 Agent 黑名单默认全开 / Kairos 白名单默认全关 + 安装卸载）。
- 二进制 v0 走约定路径 `<userData>/plugins/fs-watch/bin/` + 设置页"选择二进制安装"，不随应用打包。

## 受影响文件

- `docs/design-docs/agent-plugins-fs-watch.md`（新增，替代已删除的 `agent-sidecar-fs-watch.md`）
- `docs/design-docs/index.md`
- `docs/design-docs/agent-index.md`
