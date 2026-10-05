import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { seedSession } from "./seed";

/** 远端 Host：一台已连接、一台离线、一台已撤销，供运行位置菜单和侧栏做视觉验证。 */
export function remoteHostScenario({ db }: MockClock): MockHandlers | void {
  db.hosts = [
    { id: "conn-devbox", hostId: "devbox", name: "开发机 devbox", endpoint: { kind: "ssh", alias: "devbox", port: 22 }, state: "connected" },
    { id: "conn-gpu", hostId: "gpu-server", name: "GPU 服务器", endpoint: { kind: "wss", url: "wss://gpu.example.com/host" }, state: "offline", error: "连接超时" },
    { id: "conn-laptop", hostId: "old-laptop", name: "旧笔记本", endpoint: { kind: "ssh", alias: "old-laptop", port: 22 }, state: "revoked", error: "配对已被撤销" },
  ];
  seedSession(db, { title: "本地：整理设置页", minutesAgo: 30, turns: [["设置页的分组顺序是什么？", "通用、模型、工具、媒体、技能、扩展、活动。"]] });
  seedSession(db, { title: "devbox：跑集成测试", minutesAgo: 5, hostId: "devbox", turns: [["在 devbox 上跑一遍集成测试。", "已在 devbox 上完成：42 个通过，0 个失败。"]] });
  seedSession(db, { title: "GPU：训练日志", minutesAgo: 120, hostId: "gpu-server", turns: [["看一下昨晚的训练日志。", "第 12 个 epoch 后 loss 稳定在 0.31。"]] });
}
