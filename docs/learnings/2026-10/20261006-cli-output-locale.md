# 命令行工具的输出随系统语言变化：判断结果不要匹配给人看的文字

> 来自 Desktop 前端重构 15（运行目标）的 T13 和收尾验收。history：`docs/histories/2026-10/20261006-1045-desktop-fe-15-run-target.md`。

## 现象

`workspace-git-context-service` 里有这样一段：

```ts
const repository = await runGit(runner, ["rev-parse", "--show-toplevel"], root);
if (!isGitRunSuccess(repository)) {
  const error = sanitizeGitError(repository);
  return /not a git repository/i.test(error)
    ? contextFailure("not_repository", root)
    : contextFailure("failed", root, error);
}
```

在英文系统上没问题。在本机（`LANG=zh_CN.UTF-8`）上，同一个空目录得到的是：

```
$ git -C /tmp/empty rev-parse --show-toplevel
致命错误：不是 Git 仓库（或者任何父目录）：.git
```

正则匹配不上，「不是仓库」被判成了「检查失败」。对应的测试在这台机器上从基线起就一直是红的，CI 如果跑在英文环境里则一直是绿的：**同一份代码，测试结果取决于跑测试的机器用什么语言。**

## 为什么会这样

git、ls、grep 这些工具通过 gettext 做本地化。它们写到 stderr 的提示是**给人看的**，会按环境变量翻译：

| 变量 | 作用 |
| --- | --- |
| `LANGUAGE` | gettext 专用，列出偏好的翻译语言，优先级最高 |
| `LC_ALL` | 覆盖所有 `LC_*` 和 `LANG` |
| `LC_MESSAGES` | 只管提示文字 |
| `LANG` | 兜底 |

有一个容易忽略的规则：**当实际生效的 locale 是 `C` / `POSIX` 时，gettext 忽略 `LANGUAGE`。** 所以 `LC_ALL=C` 足以让输出变回英文，即使用户设了 `LANGUAGE=zh_CN`：

```
$ LANGUAGE=zh_CN LC_ALL=C git -C /tmp/empty rev-parse --show-toplevel
fatal: not a git repository (or any of the parent directories): .git
```

Electron 的 main 进程启动子进程时，默认把自己的环境变量传下去。从终端启动时带着终端的 `LANG`；从 Finder / Dock 启动时环境由 launchd 给，可能根本没有 `LANG`。同一台机器上，两种启动方式下 git 的提示语言可能都不一样，这正是不能依赖它的原因。

## 退出码能不能代替？

先想到的是看退出码，但 git 的致命错误统一是 128：

```
$ git -C /tmp/empty rev-parse --show-toplevel; echo $?   # 不是仓库
128
$ git -C /locked-dir rev-parse --show-toplevel; echo $?  # 没有权限，也是 128
128
```

退出码只能分出「成功 / 失败」，分不出「为什么失败」。

## 怎么判断才稳

按可靠程度排：

1. **用机器可读的接口提问，让答案出现在 stdout。**
   - 例如 `git rev-parse --is-inside-work-tree` 在仓库里输出 `true`；
   - 再如 `git status --porcelain`、`--format=...`。
   - 这些输出是约定好的格式，不翻译。
   - 代价：失败时仍然只知道「失败了」。本项目的 workspace-environment 把任何失败都当「不是仓库」，没有权限之类的错误就被吞掉了。
2. **需要按错误文字分类时，固定 locale。**
   - 只给这一次调用设 `LC_ALL=C`，分类用英文原文；
   - 给用户看的错误另外处理。
3. **最差：直接匹配本地化后的文字。** 结果取决于用户的系统语言。

另一个取舍：如果给所有子进程都设 `LC_ALL=C`，分类是稳了，但直接展示给用户的错误原文也会变成英文。分类和展示是两种用途，最好分开对待。

## 核心要点

- stderr 上的提示是给人看的 UI，会被翻译；不要拿它做程序判断。
- `LC_ALL=C` 让 gettext 忽略 `LANGUAGE`，是固定输出语言最简单的办法。
- 退出码常常只区分成功和失败；需要知道原因时，优先找带机器可读输出的子命令。
- 「这个测试在我机器上红、在 CI 上绿」时，先比较两边的 `LANG` / `LC_*`。
- 测试里断言子进程的错误文字时，也会遇到同样的问题。本次 `run-git.test.ts` 改成只断言 stderr 里包含出错的子命令名，不断言整句。

## 自检问题

1. 用户设了 `LANGUAGE=zh_CN:en`、`LANG=en_US.UTF-8`，git 的提示是什么语言？如果再加 `LC_ALL=C` 呢？
2. 为什么「只给分类用的那一次调用设 `LC_ALL=C`」比「给所有 git 调用都设」更合适？什么时候反过来更合适？
3. 手边还有哪些代码在 `catch` 里用 `error.message.includes(...)` 判断错误类型？它们的 message 来自哪里，会不会被翻译？
