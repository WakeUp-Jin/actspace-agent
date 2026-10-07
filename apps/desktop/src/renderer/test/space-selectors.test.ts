import { describe, expect, it } from "vitest";
import { createActors, createSpaces } from "../components/space/model/fixtures";
import {
  availablePanelKinds, describeMember, filterRoster, groupMembers, hasDiff, panelContextOf, panelDefaults, panelFor, panelKey,
  panelScope, parseActorRefs, pillCounts, plainOf, showTodo, splitDirs, trayList, waitCount,
} from "../components/space/model/selectors";
import { initialState } from "../components/space/model/space-demo-store";
import { fileRows, reviewFiles, terminalLines } from "../components/space/model/panel-fixtures";
import type { SpaceDemoState, SpaceMember } from "../components/space/model/types";

const sp1 = () => createSpaces()[0];
const member = (space: ReturnType<typeof sp1>, id: string): SpaceMember => space.members.find((m) => m.id === id)!;

describe("groupMembers", () => {
  it("按 wait → fail → run → result → idle 排，空组去掉", () => {
    const groups = groupMembers(sp1().members);
    expect(groups.map((g) => g.status)).toEqual(["wait", "run", "result", "idle"]);
    expect(groups.map((g) => g.members.length)).toEqual([1, 2, 1, 2]);
  });
  it("没有成员时返回空数组", () => expect(groupMembers([])).toEqual([]));
});

describe("pillCounts / trayList / waitCount", () => {
  it("当前看的 Actor 不进托盘和胶囊", () => {
    const space = sp1();
    expect(pillCounts(space, "coord").wait).toBe(1);
    expect(pillCounts(space, "be").wait).toBe(0);
    expect(trayList(space, "coord").map((m) => m.id)).toEqual(["be"]);
    expect(trayList(space, "be")).toEqual([]);
  });
  it("其他状态照常计数；左栏徽标不排除当前标签", () => {
    const space = sp1();
    expect(pillCounts(space, "be")).toMatchObject({ fail: 0, run: 2, result: 1, idle: 2 });
    expect(waitCount(space)).toBe(1);
  });
});

describe("describeMember", () => {
  const space = sp1();
  it("等你决定写它在等什么", () => expect(describeMember(member(space, "be")).text).toBe("批准新索引的迁移"));
  it("工作中写任务", () => expect(describeMember(member(space, "fe")).text).toBe("web 端报价缓存"));
  it("有结果带对勾和「完成：」", () => {
    expect(describeMember(member(space, "perf"))).toMatchObject({ check: true, title: "完成：慢查询分析" });
  });
  it("空闲写上次，没有任务时灰字", () => {
    expect(describeMember(member(space, "env"))).toMatchObject({ text: "上次：确认压测环境", faint: true });
    expect(describeMember(member(space, "tester")).text).toBe("还没有任务");
    expect(describeMember({ ...member(space, "env"), note: "命令被拒绝，等你给方向" }).text).toBe("命令被拒绝，等你给方向");
  });
  it("待办进度只在三种状态显示", () => {
    expect(showTodo(member(space, "be"))).toBe(true);
    expect(showTodo(member(space, "perf"))).toBe(true);
    expect(showTodo({ ...member(space, "be"), status: "idle" })).toBe(false);
    expect(showTodo(member(space, "tester"))).toBe(false);
  });
});

describe("parseActorRefs", () => {
  const actors = createActors();
  it("把 [[id]] 拆成片段", () => {
    expect(parseActorRefs("交给 [[be]] 和 [[fe]]。", actors)).toEqual([
      { type: "text", text: "交给 " }, { type: "actor", id: "be" },
      { type: "text", text: " 和 " }, { type: "actor", id: "fe" }, { type: "text", text: "。" },
    ]);
  });
  it("未知引用原样保留，并和相邻文字合并", () => {
    expect(parseActorRefs("a [[nobody]] b", actors)).toEqual([{ type: "text", text: "a [[nobody]] b" }]);
  });
  it("没有引用时只有一段文字", () => expect(parseActorRefs("你好", actors)).toEqual([{ type: "text", text: "你好" }]));
  it("plainOf 换成名字", () => expect(plainOf("交给 [[be]]", actors)).toBe("交给 后端"));
});

describe("名册搜索", () => {
  const actors = createActors();
  it("按名字、场景、能力过滤，不含新起的", () => {
    expect(filterRoster(actors, "").length).toBe(8);
    expect(filterRoster(actors, "后端").map((a) => a.id)).toEqual(["be"]);
    expect(filterRoster(actors, "Vitest").map((a) => a.id)).toEqual(["tester"]);
    expect(filterRoster(actors, "环境巡检")).toEqual([]);
  });
});

describe("右栏默认标签", () => {
  const space = sp1();
  const ids = (p: ReturnType<typeof panelDefaults>) => p.tabs.map((t) => t.kind);
  it("协调 Agent：Actor、库、记忆，选中 Actor", () => {
    const p = panelDefaults("coord");
    expect(ids(p)).toEqual(["actors", "library", "memory"]);
    expect(p.active).toBe("actors");
  });
  it("Actor 有带 diff 的行：Review + 终端", () => {
    expect(hasDiff(member(space, "be"))).toBe(true);
    const p = panelDefaults("actor", member(space, "be"));
    expect(ids(p)).toEqual(["review", "terminal"]);
    expect(p.active).toBe("review");
  });
  it("Actor 没有改动：文件 + 终端", () => {
    const p = panelDefaults("actor", member(space, "tester"));
    expect(ids(p)).toEqual(["files", "terminal"]);
    expect(p.active).toBe("files");
  });
  it("一对一：文件", () => {
    const p = panelDefaults("solo");
    expect(ids(p)).toEqual(["files"]);
    expect(p.active).toBe("files");
  });
  it("每个上下文能开的种类", () => {
    expect(availablePanelKinds("coord")).toEqual(["actors", "library", "memory", "files", "terminal"]);
    expect(availablePanelKinds("actor")).toEqual(["subagents", "files", "review", "context", "terminal", "reply"]);
    expect(availablePanelKinds("solo")).toEqual(availablePanelKinds("actor"));
  });
});

describe("panelKey / panelFor / panelScope", () => {
  const base = (): SpaceDemoState => initialState();
  it("三种上下文的 key", () => {
    const s = base();
    expect(panelKey(s)).toBe("sp1:coord");
    expect(panelContextOf(s)).toBe("coord");
    const withTab: SpaceDemoState = { ...s, spaces: s.spaces.map((sp) => (sp.id === "sp1" ? { ...sp, openTabs: ["be"], activeTab: "be" } : sp)) };
    expect(panelKey(withTab)).toBe("sp1:be");
    expect(panelContextOf(withTab)).toBe("actor");
    expect(panelKey({ ...s, view: "chat", chatWith: "fe" })).toBe("chat:fe");
    expect(panelContextOf({ ...s, view: "chat", chatWith: "fe" })).toBe("solo");
    expect(panelKey({ ...s, view: "roster" })).toBeNull();
    expect(panelFor({ ...s, view: "roster" })).toBeNull();
  });
  it("目录范围：协调 Agent 用 Space 目录，Actor 用自己的目录或工作树", () => {
    const s = base();
    expect(panelScope(s)).toMatchObject({ roots: ["payments-api", "checkout-web"], coord: true });
    const load: SpaceDemoState = { ...s, spaces: s.spaces.map((sp) => (sp.id === "sp1" ? { ...sp, openTabs: ["load"], activeTab: "load" } : sp)) };
    expect(panelScope(load)).toMatchObject({ dir: "payments-api", branch: "space/load-test", tree: "space/load-test" });
    expect(panelScope({ ...s, view: "chat", chatWith: "fe" })).toMatchObject({ dir: "payments-api", branch: "main" });
    expect(panelScope({ ...s, view: "roster" })).toBeNull();
  });
});

describe("面板 mock 内容", () => {
  it("文件树按展开集合和过滤词出行", () => {
    const rows = fileRows(["checkout-web"], ["checkout-web", "checkout-web/src"], "");
    expect(rows.map((r) => r.name)).toEqual(["checkout-web", "src", "hooks", "pages", "package.json"]);
    expect(rows[0].root).toBe(true);
    const filtered = fileRows(["payments-api"], [], "quote");
    expect(filtered.map((r) => r.path)).toContain("payments-api/src/quote/service.ts");
    expect(filtered.every((r) => !r.dir)).toBe(true);
  });
  it("终端：协调 Agent 提示，Actor 列出跑过的命令", () => {
    expect(terminalLines({ coord: true })[0].kind).toBe("dim");
    const lines = terminalLines({ coord: false, member: member(sp1(), "be"), memberName: "后端" });
    expect(lines[0]).toEqual({ kind: "cmd", text: "pnpm test quote", result: "18 通过" });
    expect(lines.at(-1)?.text).toBe("# 等你批准：pnpm db:migrate --env staging-2");
  });
  it("Review 汇总带 diff 的行", () => {
    expect(reviewFiles(member(sp1(), "be"))).toEqual([
      { name: "src/quote/service.ts", add: 24, del: 9 },
      { name: "migrations/20261002_quote_sku_idx.sql", add: 8, del: 0 },
    ]);
    expect(reviewFiles(member(sp1(), "tester"))).toEqual([]);
  });
});

describe("splitDirs", () => {
  it("逗号、中文逗号、空白都能分", () => expect(splitDirs("a, b，c d")).toEqual(["a", "b", "c", "d"]));
});
