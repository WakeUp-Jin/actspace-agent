# 本机 Git / 工作树补验（2026-10-22）

终态记录（限定本批次已执行子点），固定dist，无产品修改。真实Electron/Playwright CDP，非native AX。专用profile和fixture在`tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-git-20261022/`；Git写入仅该目录，bare origin仅本机，不是GitHub。设置synthetic模型通过真实IPC装配，不冒称模型设置UI。工作区列表用独立workspaces.json种子，UI逐个选择，不冒称native目录选择器。父仓库Git发现通过GIT_CEILING_DIRECTORIES隔离。

验收点：15-A9三类目录；R19新建分支及禁用；09-P4-3窄窗菜单；09-P4-4工作树首次发送与磁盘/悬停；11-B1重启恢复树/预览/Review；R11分支比较；14-A6移除刷新；R14归档；P2-D01首启无模型；P2-D02重复/别名；15-A8旧偏好迁移；可执行时13-A6五mock、10-B1轨迹。路线：目录菜单→首次发送工作树→重启Review→工作区管理。

| 编号 | 当前结果/证据 |
|---|---|
| P2-D01 | 子项通过：新profile首次启动无Key/模型显示“未连接模型”，发送按钮disabled并提示“暂无可用模型，请在设置中连接服务商”；未访问用户profile。 |
| 15-A9 非Git | 通过：选择non-git后不显示分支控件；运行位置的工作树disabled，原因“当前工作区不是可用的 Git 仓库”；non-git-menu.png。 |
| 15-A9 空Git | 通过：empty-git为git init -b main无commit，显示main；工作树disabled，原因“需要先创建提交”；empty-git-menu.png。 |
| 15-A9 有提交 | 通过分支子项：菜单列main/feature-fixture；选择后磁盘main，首次发送后磁盘feature-fixture；模型轮暂停另列，未冒称完成。 |
| R19 | 通过已执行子项：非Git/空Git禁用原因、实际新建并切换acceptance/new-branch；证据见最终批次。 |
| 11-B2 | 未覆盖：gh已登录，但没有专用GitHub验收repo/获准远端分支；不为覆盖创建正式PR。本机bare origin不代签GitHub。 |

未覆盖项以最终批次记录为准，不把初始状态代签终态。

## 第二次进展落盘

- 15-A9 有提交目录：通过UI选择feature-fixture，首次发送前磁盘main；首次发送后`git branch --show-current`为feature-fixture。`branch-switch-completed.png`。任务进入暂停队列，未完成模型轮，分支事实不据此缩减。
- 09-P4-4：真实首次发送已经创建`actspace/63390151`及`desktop-data/worktrees/63390151/committed`，base为feature-fixture，HEAD为ba22a918。证据`worktree-list.txt`、`worktree-created-paused.png`和独立profile Journal。状态行仍显示新建工作树、任务暂停，完整复合项尚不通过。
- Provider仅收到两条title请求，普通任务启动前queue pause；已绑定chat/utility/explore的synthetic模型仍复现。保留事实继续其它UI，不把此现象归因真实模型或远端Host。

## 最终批次实际结果

- R19 创建分支：环境→当前分支→创建并切换新分支→acceptance/new-branch→创建。磁盘真实branch为acceptance/new-branch；`new-branch-created.png`。分支列表将actspace/63390151标为位于工作树。非Git/空Git禁用原因见前表。
- 09-P4-3：真实BrowserWindow480×800，工作区菜单x65/w260，分支x172/w300，运行位置x65/w240，均在480px内；`narrow-workspace-menu.png`、`narrow-branch-menu.png`、`narrow-run-menu.png`。Host子菜单无已配对Host，未覆盖，不把三个菜单代签整个复合项。
- 09-P4-4：工作树已实际创建并持久化，但未完成首个模型轮，界面保留“新建工作树”而不是预期只读branch·工作树，悬停来源/起点未验证。部分覆盖。
- 11-B1：重启原独立profile后打开历史工作树会话→右侧文件→readme.md，Markdown显示Isolated Git acceptance/Baseline content；Review未提交范围显示暂无变更。`restarted-worktree-preview.png`、`restarted-worktree-review.png`。这是本轮新建后跨进程恢复的会话，不是旧版本header迁移fixture，不代签旧版本兼容。
- R11：Review→范围→分支，显示“没有本地分支设置了远程跟踪分支”；磁盘`branches-disk.txt`却有main [origin/main]。`review-upstream-empty.png`。复现既有WB-BRANCH-01，真实UI比较未覆盖。
- 14-A6：更多操作empty-git→从侧栏移除→workspace.hidden=true；之后真实IPC rename另会话成功并reload，empty-git仍不出现。`workspace-hidden-after-rename.png`。移除为真实UI；标题刷新为IPC装配，不冒称完整重命名UI路线。
- R14：committed→归档全部，主目录会话c2477b0d归档=true且普通列表移除，工作树会话c5e4acce仍未归档；第二次归档全部仍保留。`archive-all-final.png`。没有把“全部”判通过。
- P2-D14：恢复工作树Review空diff已验证；冲突未构造，未覆盖。
- P2-D20：只覆盖本报告列出的Git/工作树子点，不做整体通过结论。

旧Electron11389/21547最初Inspector quit未实际退出，导致重启时会话owner锁；已仅对这两个本次PID发送TERM并确认退出，再成功rename。该装配错误不计产品Bug。

未执行项：P2-D02 native目录添加重复/路径别名、15-A8旧remote-models启动迁移、13-A6五mock交互、10-B1轨迹fixture。该批次按主审收束要求未扩展这些独立路线，不写通过。

## 清理终态

本次Electron11389/21547经TERM退出；最后实例4539经app.close正常关闭；受控HTTP Provider53304关闭。最终ps三个PID为空、lsof53304无监听；证据cleanup-final.json。保留独立Git仓库/worktree与报告，未碰用户dev61739。没有产品改动、提交、合并、部署或外部推送。
