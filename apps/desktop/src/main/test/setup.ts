import { devNull } from "node:os";

// main 进程测试会在临时目录里真的跑 git，这里隔离开发机的用户级和系统级 git 配置。
// 例如 `core.fsmonitor=true` 会让 git 给每个临时仓库拉起 fsmonitor 守护进程并占住 stdio 管道，
// 子进程调用要等几十秒才返回，直接撞 5s 超时。
process.env.GIT_CONFIG_GLOBAL = devNull;
process.env.GIT_CONFIG_NOSYSTEM = "1";
