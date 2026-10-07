import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpaceDemoStore, TIMING, type SpaceDemoStore } from "../components/space/model/space-demo-store";
import { createSpaces } from "../components/space/model/fixtures";
import { currentSpace, currentTab, panelFor, panelKey, trayList } from "../components/space/model/selectors";
import type { Space, SpaceMember } from "../components/space/model/types";

let store: SpaceDemoStore;
const st = () => store.getSnapshot();
const sp = (id = st().spaceId): Space => st().spaces.find((s) => s.id === id)!;
const mem = (id: string, sid?: string): SpaceMember => sp(sid).members.find((m) => m.id === id)!;
const kinds = (key: string) => st().panels[key].tabs.map((t) => t.kind);

function makeStore() {
  let n = 0;
  return createSpaceDemoStore({ makeId: () => String(++n).padStart(5, "0") });
}
const tick = (ms: number) => vi.advanceTimersByTime(ms);
/** 一步一步推进假时钟，直到条件成立 */
function runUntil(pred: () => boolean, limit = 4000) {
  for (let i = 0; i < limit && !pred(); i += 1) tick(10);
  expect(pred()).toBe(true);
}
const lastCoord = () => {
  const m = sp().msgs.at(-1);
  return m?.k === "coord" ? m : undefined;
};
const replyDone = () => { const m = lastCoord(); return !!m && !m.typing && m.shown == null; };

beforeEach(() => {
  vi.useFakeTimers();
  store = makeStore();
});
afterEach(() => {
  store.dispose();
  vi.useRealTimers();
});

describe("状态不可变", () => {
  it("没有变化时 getSnapshot 返回同一个引用，变化后产生新引用", () => {
    const a = st();
    expect(st()).toBe(a);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.actions.toggleGroup("idle");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(st()).not.toBe(a);
    expect(st().collapsed.idle).toBe(true);
    expect(a.collapsed.idle).toBeUndefined();
    off();
  });

  it("只有被改到的 Space 和成员换引用", () => {
    const before = st();
    store.actions.openActorTab("fe");
    const after = st();
    expect(after.spaces[0]).not.toBe(before.spaces[0]);
    expect(after.spaces[1]).toBe(before.spaces[1]);
    expect(after.spaces[0].members.find((m) => m.id === "be")).toBe(before.spaces[0].members.find((m) => m.id === "be"));
    expect(before.spaces[0].openTabs).toEqual([]);
  });
});

describe("发送、流式、审批", () => {
  it("发送 → 回复前跳动点 → 流式 → 成员进入工作中并点亮 → 3.6s 后等你决定 → 批准回到工作中", () => {
    store.actions.send("给支付页加个缓存");
    expect(lastCoord()?.typing).toBe(true);
    expect(sp().msgs.at(-2)).toEqual({ k: "user", t: "给支付页加个缓存" });

    tick(TIMING.typing);
    expect(lastCoord()).toMatchObject({ typing: false, shown: 0 });
    tick(TIMING.streamTick);
    expect(lastCoord()?.shown).toBe(3);

    runUntil(replyDone);
    const nid = "n00001";
    expect(mem(nid)).toMatchObject({ status: "run", task: "排查现有实现", todo: [0, 3] });
    expect(sp().members[0].id).toBe(nid);
    expect(st().actors[nid]).toMatchObject({ nascent: true, name: "排查现有实现" });
    // 空闲的名册 Actor 同步开工
    expect(mem("tester")).toMatchObject({ status: "run", task: "给支付页加个缓存", todo: [0, 3] });
    expect(st().litRows).toEqual([nid, "tester"]);
    const rev = st().rowsRevision;
    expect(rev).toBeGreaterThan(0);

    const pulse = st().approvalPulse;
    tick(TIMING.approvalArrives - 1);
    expect(mem(nid).status).toBe("run");
    tick(1);
    expect(mem(nid)).toMatchObject({ status: "wait", ask: "想跑带覆盖率的测试", todo: [1, 3] });
    expect(mem(nid).approval?.cmd).toBe("pnpm test --coverage");
    expect(st().approvalPulse).toBe(pulse + 1);
    expect(st().rowsRevision).toBe(rev + 1);
    expect(trayList(currentSpace(st()), currentTab(st())).map((m) => m.id)).toEqual([nid, "be"]);

    store.actions.approve(nid);
    expect(mem(nid)).toMatchObject({ status: "run", ask: null, todo: [2, 3] });
    expect(st().notice?.text).toBe("已批准，排查现有实现 继续了");
  });

  it("流式结束后 shown 置空，正文保留引用", () => {
    store.actions.send("加个缓存");
    runUntil(replyDone);
    const m = lastCoord()!;
    expect(m.shown).toBeNull();
    expect(m.t).toContain("[[n00001]]");
    expect(m.plain).toBe("先让新起的 排查现有实现 摸清现有实现，测试员 同步准备测试。");
  });

  it("拒绝进入空闲并写「命令被拒绝，等你给方向」", () => {
    store.actions.deny("be");
    expect(mem("be")).toMatchObject({ status: "idle", note: "命令被拒绝，等你给方向", last: "quote N+1 修复", denied: true, ask: null });
    expect(st().notice?.text).toBe("已拒绝，后端 等你给别的方向");
  });

  it("批准只处理等你决定的成员；托盘处理完自动收起", () => {
    store.actions.approve("fe");
    expect(mem("fe").todo).toEqual([3, 5]);
    store.actions.toggleTray();
    expect(st().trayOpen).toBe(true);
    store.actions.approve("be");
    expect(mem("be")).toMatchObject({ status: "run", todo: [5, 6] });
    expect(st().trayOpen).toBe(false);
  });

  it("托盘翻页和「查看」", () => {
    store.actions.toggleTray();
    store.actions.trayNext();
    expect(st().trayIdx).toBe(0);
    store.actions.trayView("be");
    expect(st().trayOpen).toBe(false);
    expect(currentTab(st())).toBe("be");
  });

  it("Space 里的成员都空闲时，交给第一个并新起一个", () => {
    store.actions.switchSpace("sp2");
    store.actions.send("x");
    store.actions.openActorTab("fe");
    expect(currentTab(st())).toBe("fe");
    store.actions.selectTab("coord");
    store.actions.send("再来一件");
    runUntil(replyDone);
    // sp2 的名册 Actor 都空闲，所以会交给第一个
    expect(sp("sp2").members.filter((m) => m.status === "run").length).toBeGreaterThanOrEqual(1);
  });
});

describe("标签", () => {
  it("打开 Actor 标签清未读，已开的只切换", () => {
    store.actions.openActorTab("perf");
    store.actions.openActorTab("fe");
    store.actions.openActorTab("perf");
    expect(sp().openTabs).toEqual(["perf", "fe"]);
    expect(currentTab(st())).toBe("perf");
    expect(mem("perf").unread).toBe(false);
  });

  it("有结果看过 1.4s 后滑到空闲", () => {
    store.actions.openActorTab("perf");
    expect(mem("perf").status).toBe("result");
    tick(TIMING.resultSettles - 1);
    expect(mem("perf").status).toBe("result");
    tick(1);
    expect(mem("perf")).toMatchObject({ status: "idle", last: "慢查询分析", task: null });
  });

  it("关当前标签跳到左边，没有就回协调 Agent", () => {
    for (const id of ["be", "fe", "perf"]) store.actions.openActorTab(id);
    store.actions.closeTab("perf");
    expect(currentTab(st())).toBe("fe");
    store.actions.selectTab("be");
    store.actions.closeTab("be");
    expect(currentTab(st())).toBe("coord");
    expect(sp().openTabs).toEqual(["fe"]);
    store.actions.closeTab("coord");
    expect(sp().openTabs).toEqual(["fe"]);
  });

  it("关别的标签不改当前选中；关闭其他标签", () => {
    for (const id of ["be", "fe", "perf"]) store.actions.openActorTab(id);
    store.actions.closeTab("be");
    expect(currentTab(st())).toBe("perf");
    store.actions.closeOtherTabs();
    expect(sp().openTabs).toEqual(["perf"]);
    store.actions.selectTab("coord");
    store.actions.closeOtherTabs();
    expect(sp().openTabs).toEqual([]);
  });

  it("切 Space 恢复各自标签", () => {
    store.actions.openActorTab("fe");
    store.actions.openActorTab("be");
    store.actions.switchSpace("sp2");
    expect(currentTab(st())).toBe("coord");
    store.actions.openActorTab("docs");
    store.actions.switchSpace("sp1");
    expect(sp().openTabs).toEqual(["fe", "be"]);
    expect(currentTab(st())).toBe("be");
    store.actions.switchSpace("sp2");
    expect(currentTab(st())).toBe("docs");
  });
});

describe("右栏", () => {
  it("第一次读取时按默认值生成，各上下文互不影响", () => {
    expect(panelKey(st())).toBe("sp1:coord");
    expect(kinds("sp1:coord")).toEqual(["actors", "library", "memory"]);
    store.actions.openActorTab("be");
    expect(kinds("sp1:be")).toEqual(["review", "terminal"]);
    store.actions.openActorTab("fe");
    expect(kinds("sp1:fe")).toEqual(["review", "terminal"]); // 前端对话里有 diff 行
    store.actions.openActorTab("tester");
    expect(kinds("sp1:tester")).toEqual(["files", "terminal"]);
    store.actions.openPanelTab("context");
    expect(kinds("sp1:tester")).toEqual(["files", "terminal", "context"]);
    expect(kinds("sp1:be")).toEqual(["review", "terminal"]);
    expect(kinds("sp1:coord")).toEqual(["actors", "library", "memory"]);
    store.actions.openSoloChat("docs");
    expect(panelKey(st())).toBe("chat:docs");
    expect(kinds("chat:docs")).toEqual(["files"]);
  });

  it("openPanelTab 已开就切过去，不重复；会打开右栏", () => {
    store.actions.setPanelOpen(false);
    store.actions.openPanelTab("files");
    expect(st().panelOpen).toBe(true);
    store.actions.openPanelTab("terminal");
    store.actions.openPanelTab("files");
    const p = panelFor(st())!;
    expect(p.tabs.map((t) => t.kind)).toEqual(["actors", "library", "memory", "files", "terminal"]);
    expect(p.active).toBe("files");
  });

  it("selectPanelTab 切换，未知 id 忽略", () => {
    store.actions.selectPanelTab("memory");
    expect(panelFor(st())?.active).toBe("memory");
    store.actions.selectPanelTab("nope");
    expect(panelFor(st())?.active).toBe("memory");
  });

  it("关当前标签跳左边；关到没有就 active=null", () => {
    store.actions.selectPanelTab("library");
    store.actions.closePanelTab("library");
    expect(panelFor(st())?.active).toBe("actors");
    store.actions.closePanelTab("actors");
    expect(panelFor(st())?.active).toBe("memory");
    store.actions.closePanelTab("memory");
    expect(panelFor(st())).toEqual({ tabs: [], active: null });
    // 关掉别的标签不改选中
    store.actions.openPanelTab("files");
    store.actions.openPanelTab("terminal");
    store.actions.closePanelTab("files");
    expect(panelFor(st())?.active).toBe("terminal");
  });

  it("文件树：展开、过滤、打开单个文件", () => {
    store.actions.toggleFileDir("payments-api/load");
    expect(st().ftOpen).toContain("payments-api/load");
    store.actions.toggleFileDir("payments-api/load");
    expect(st().ftOpen).not.toContain("payments-api/load");
    store.actions.setFileQuery("quote");
    expect(st().ftQuery).toBe("quote");
    store.actions.openFile("payments-api/load/quote.js");
    expect(st().ftSelected).toBe("payments-api/load/quote.js");
    expect(panelFor(st())?.active).toBe("file:payments-api/load/quote.js");
    expect(panelFor(st())?.tabs.at(-1)).toMatchObject({ kind: "file", path: "payments-api/load/quote.js", label: "quote.js" });
  });

  it("togglePanel 和 panelOpen；名册页没有右栏", () => {
    expect(store.panelOpen()).toBe(true);
    store.actions.togglePanel();
    expect(store.panelOpen()).toBe(false);
    store.actions.togglePanel();
    store.actions.goRoster();
    expect(store.panelOpen()).toBe(false);
    expect(store.panelKey()).toBeNull();
  });

  it("showActorsPanel 回协调 Agent 并切到 Actor 标签", () => {
    store.actions.openActorTab("be");
    store.actions.showActorsPanel();
    expect(currentTab(st())).toBe("coord");
    expect(panelFor(st())?.active).toBe("actors");
  });
});

describe("留下 Actor、记忆", () => {
  it("留下：先 growing，950ms 后 nascent=false、换角色图、写名册属性", () => {
    store.actions.keepActor("env");
    expect(sp().msgs.at(-1)).toMatchObject({ k: "keep", state: "growing" });
    expect(st().actors.env.nascent).toBe(true);
    tick(TIMING.grow - 1);
    expect(st().actors.env.nascent).toBe(true);
    tick(1);
    expect(st().actors.env).toMatchObject({ nascent: false, img: 9, abilities: ["环境检查", "健康探测"], memN: 1, last: "刚刚长成", spaces: 1 });
    expect(sp().msgs.at(-1)).toMatchObject({ state: "kept" });
    expect(st().freshCard).toBe("env");
    expect(st().justGrown).toEqual({ id: "env", revision: 1 });
    expect(st().notice?.text).toBe("环境巡检 进入了名册");
    store.actions.clearFreshCard();
    store.actions.clearJustGrown();
    expect(st().freshCard).toBeNull();
    expect(st().justGrown).toBeNull();
  });

  it("留下的长成动画不被切 Space 打断", () => {
    store.actions.keepActor("env");
    store.actions.switchSpace("sp2");
    tick(TIMING.grow);
    expect(st().actors.env.nascent).toBe(false);
    expect(sp("sp1").msgs.at(-1)).toMatchObject({ state: "kept" });
  });

  it("不用：卡片变成 declined，Actor 仍是新起的", () => {
    store.actions.declineActor("env");
    expect(sp().msgs.at(-1)).toMatchObject({ state: "declined" });
    expect(st().actors.env.nascent).toBe(true);
    store.actions.keepActor("env");
    tick(TIMING.grow);
    expect(st().actors.env.nascent).toBe(true);
  });

  it("撤销记忆同时删 Space 记忆", () => {
    store.actions.undoMemory("m1");
    expect(sp().msgs.find((m) => m.k === "mem")).toMatchObject({ undone: true });
    expect(sp().memory.map((m) => m.id)).toEqual(["m2", "m3"]);
    expect(st().notice?.text).toBe("撤销了这条记忆");
  });

  it("忘记一条记忆", () => {
    store.actions.forgetMemory("m2");
    expect(sp().memory.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(st().notice?.text).toBe("已忘记");
  });
});

describe("提示", () => {
  it("2.2s 后自动清掉；新提示顶掉旧的并重新计时", () => {
    store.actions.showNotice("甲");
    const first = st().notice!.id;
    tick(2000);
    store.actions.showNotice("乙");
    expect(st().notice).toMatchObject({ text: "乙" });
    expect(st().notice!.id).not.toBe(first);
    tick(TIMING.notice - 1);
    expect(st().notice?.text).toBe("乙");
    tick(1);
    expect(st().notice).toBeNull();
  });
});

describe("一对一、名册、新建 Space", () => {
  it("一对一：最近的在前；回复前 700ms 跳动点，再流式", () => {
    store.actions.openSoloChat("be");
    store.actions.openSoloChat("fe");
    store.actions.openSoloChat("be");
    expect(st().soloChats).toEqual(["be", "fe"]);
    store.actions.send("帮我看下这个接口");
    const list = () => st().chats.be;
    expect(list().at(-1)).toMatchObject({ k: "actor", typing: true });
    tick(TIMING.soloTyping - 1);
    expect(list().at(-1)).toMatchObject({ typing: true });
    tick(1);
    expect(list().at(-1)).toMatchObject({ typing: false, shown: 0 });
    runUntil(() => (list().at(-1) as { shown?: number | null }).shown == null);
    expect(list().at(-1)).toMatchObject({ t: "收到。这在我的场景里，我先看一下，有结论直接告诉你。", shown: null });
  });

  it("名册搜索词", () => {
    store.actions.goRoster();
    store.actions.setRosterQuery("后端");
    expect(st().view).toBe("roster");
    expect(st().rosterQuery).toBe("后端");
  });

  it("新建 Space：颜色轮换、成员空闲、进入空 Space", () => {
    const id = store.actions.createSpace({ name: "  ", goal: "目标", dirs: ["a"], crew: ["be", "fe"] });
    expect(st().spaceId).toBe(id);
    expect(sp()).toMatchObject({ name: "未命名 Space", img: "cream", goal: "目标", msgs: [], activeTab: "coord" });
    expect(sp().members.map((m) => [m.id, m.status, m.dir])).toEqual([["be", "idle", "a"], ["fe", "idle", "a"]]);
    expect(st().notice?.text).toBe("创建了「未命名 Space」");
    expect(kinds(`${id}:coord`)).toEqual(["actors", "library", "memory"]);
  });
});

describe("定时器与重置", () => {
  it("切 Space 后挂起的定时器不再改原 Space", () => {
    store.actions.send("加个缓存");
    store.actions.switchSpace("sp2");
    const snapshot = st();
    tick(10_000);
    expect(sp("sp1").members.map((m) => m.id)).toEqual(createSpaces()[0].members.map((m) => m.id));
    expect(mem("be", "sp1").status).toBe("wait");
    expect(st().actors["n00001"]).toBeUndefined();
    expect(st().approvalPulse).toBe(0);
    // 没有半截的流式状态；sp2 没动
    const reply = sp("sp1").msgs.at(-1);
    expect(reply).toMatchObject({ k: "coord", typing: false, shown: null });
    expect(st().spaces[1]).toBe(snapshot.spaces[1]);
  });

  it("交事后挂着的审批定时器，在切 Space 后也不会触发", () => {
    store.actions.send("加个缓存");
    runUntil(replyDone);
    store.actions.switchSpace("sp2");
    tick(10_000);
    expect(mem("n00001", "sp1").status).toBe("run");
    expect(st().approvalPulse).toBe(0);
  });

  it("切视图也会清掉挂起的一对一回复", () => {
    store.actions.openSoloChat("be");
    store.actions.sendSolo("你好");
    store.actions.goRoster();
    tick(10_000);
    expect(st().chats.be.at(-1)).toMatchObject({ k: "actor", typing: false, shown: null });
  });

  it("reset 回到 fixtures，并清掉挂起的定时器", () => {
    store.actions.send("加个缓存");
    store.actions.openActorTab("fe");
    store.actions.keepActor("env");
    store.actions.reset();
    expect(st().spaces).toEqual(createSpaces().map((s) => ({ ...s })));
    expect(st().actors.env.nascent).toBe(true);
    expect(st().notice?.text).toBe("演示已重置");
    tick(10_000);
    expect(st().actors.env.nascent).toBe(true);
    expect(st().actors["n00001"]).toBeUndefined();
    expect(sp().members).toHaveLength(6);
    expect(st().notice).toBeNull(); // 重置提示 2.2s 后消失
  });
});
