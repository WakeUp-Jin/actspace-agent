// Space 演示的 store：带 subscribe 的小对象，状态不可变更新，时钟可注入。
// 不引入状态库；React 侧见 use-space-demo.ts。
import { spaceColorAt } from "../avatar/avatar-assets";
import {
  bumpRows, COORD_TAB, currentSpace, currentTab, findMember, initialState, mapMember, mapSpace, materialize, nameOf,
  panelFor, panelKey, plainOf, settleStreams, trayList,
} from "./selectors";
import type {
  CreateSpaceInput, PanelKind, PanelState, RosterActor, Space, SpaceDemoActions, SpaceDemoClock, SpaceDemoState,
  SpaceDemoStore, SpaceMember,
} from "./types";

export type { CreateSpaceInput, SpaceDemoActions, SpaceDemoClock, SpaceDemoStore };
export { initialState };

/** 时序常量，全部放在这里（毫秒） */
export const TIMING = {
  typing: 760,
  soloTyping: 700,
  streamTick: 26,
  streamChars: 3,
  approvalArrives: 3600,
  resultSettles: 1400,
  grow: 950,
  notice: 2200,
} as const;

// 调用时才取全局函数，这样 vi.useFakeTimers() 能接管
const defaultClock: SpaceDemoClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

const defaultMakeId = (): string => Math.random().toString(36).slice(2, 7).padEnd(5, "0");

export function createSpaceDemoStore(opts: { clock?: SpaceDemoClock; makeId?: () => string } = {}): SpaceDemoStore {
  const clock = opts.clock ?? defaultClock;
  const makeId = opts.makeId ?? defaultMakeId;
  const listeners = new Set<() => void>();
  let state = initialState();

  // 定时器分两类：space 类在切 Space / 切视图 / 重置时清掉；global 类只在重置时清（长成动画、提示条）
  const timers = { space: new Set<unknown>(), global: new Set<unknown>() };
  let spaceEpoch = 0;
  let resetEpoch = 0;
  let noticeTimer: unknown = null;

  const emit = () => listeners.forEach((l) => l());
  const update = (patch: Partial<SpaceDemoState> | ((s: SpaceDemoState) => Partial<SpaceDemoState>)) => {
    const p = typeof patch === "function" ? patch(state) : patch;
    state = materialize({ ...state, ...p });
    emit();
  };
  const after = (scope: "space" | "global", ms: number, fn: () => void): unknown => {
    const se = spaceEpoch, re = resetEpoch;
    const h = clock.setTimeout(() => {
      timers[scope].delete(h);
      if (se !== spaceEpoch && scope === "space") return;
      if (re !== resetEpoch) return;
      fn();
    }, ms);
    timers[scope].add(h);
    return h;
  };
  const clearScope = (scope: "space" | "global") => {
    timers[scope].forEach((h) => clock.clearTimeout(h));
    timers[scope].clear();
  };
  /** 离开当前 Space / 视图前调用：清定时器，把流式中的消息收成完整文字 */
  const leave = () => {
    spaceEpoch += 1;
    clearScope("space");
    state = settleStreams(state);
  };

  function notify(text: string) {
    if (noticeTimer != null) { clock.clearTimeout(noticeTimer); timers.global.delete(noticeTimer); }
    const id = makeId();
    update({ notice: { id, text } });
    noticeTimer = after("global", TIMING.notice, () => {
      noticeTimer = null;
      if (state.notice?.id === id) update({ notice: null });
    });
  }

  /* ---------- 流式回复 ---------- */
  type Streamable = { plain: string; typing?: boolean; shown?: number | null };
  interface StreamRef { get(): Streamable | undefined; patch(fn: (m: Streamable) => Streamable): void }

  function coordRef(sid: string, idx: number): StreamRef {
    return {
      get: () => { const m = state.spaces.find((s) => s.id === sid)?.msgs[idx]; return m?.k === "coord" ? m : undefined; },
      patch: (fn) => update((s) => ({
        spaces: mapSpace(s, sid, (sp) => ({
          ...sp, msgs: sp.msgs.map((m, i) => (i === idx && m.k === "coord" ? { ...m, ...fn(m) } : m)),
        })),
      })),
    };
  }
  function soloRef(aid: string, idx: number): StreamRef {
    return {
      get: () => { const m = state.chats[aid]?.[idx]; return m?.k === "actor" ? m : undefined; },
      patch: (fn) => update((s) => ({
        chats: { ...s.chats, [aid]: (s.chats[aid] ?? []).map((m, i) => (i === idx && m.k === "actor" ? { ...m, ...fn(m) } : m)) },
      })),
    };
  }

  // 先跳动点，再每 26ms 出 3 个字；用 setTimeout 链而不是 setInterval，方便假时钟推进
  function streamReply(ref: StreamRef, delay: number, onEnd?: () => void) {
    after("space", delay, () => {
      if (!ref.get()) return;
      ref.patch((m) => ({ ...m, typing: false, shown: 0 }));
      const tick = () => after("space", TIMING.streamTick, () => {
        const m = ref.get();
        if (!m || m.shown == null) return;
        const next = m.shown + TIMING.streamChars;
        if (next >= m.plain.length) { ref.patch((x) => ({ ...x, shown: null })); onEnd?.(); return; }
        ref.patch((x) => ({ ...x, shown: next }));
        tick();
      });
      tick();
    });
  }

  // 交事后几秒，一个工作中的 Actor 发出审批，用来走一遍审批流程
  function scheduleApproval(sid: string) {
    after("space", TIMING.approvalArrives, () => {
      const sp = state.spaces.find((s) => s.id === sid);
      const target = sp?.members.find((m) => m.status === "run" && !m.approval);
      if (!target) return;
      update((s) => ({
        spaces: mapSpace(s, sid, (x) => mapMember(x, target.id, (m) => ({
          ...m, status: "wait", ask: "想跑带覆盖率的测试", time: "刚刚",
          todo: m.todo ? [1, m.todo[1]] : m.todo,
          approval: { cmd: "pnpm test --coverage", why: "需要跑带覆盖率的完整测试，耗时约 2 分钟，会写入 coverage/ 目录。" },
          transcript: [...m.transcript, { k: "approval" }],
        }))),
        ...bumpRows(s, []),
        approvalPulse: s.approvalPulse + 1,
      }));
    });
  }

  /* ---------- 动作 ---------- */
  function send(raw: string) {
    const text = raw.trim();
    if (!text) return;
    if (state.view === "chat") return sendSolo(text);
    if (state.view !== "space") return;
    const sid = state.spaceId;
    const space = currentSpace(state);
    // 先找空闲的名册 Actor；名册里没有合适的，就在这个 Space 里新起一个
    const idle = space.members.find((m) => m.status === "idle" && !state.actors[m.id]?.nascent);
    const nid = "n" + makeId();
    const nascent: RosterActor = {
      id: nid, name: "排查现有实现", nascent: true, scene: "把现有实现摸清楚。", abilities: [],
      growImg: (hashCode(nid) % 9) + 1,
    };
    const short = text.length > 16 ? text.slice(0, 16) + "…" : text;
    const t = idle
      ? `先让新起的 [[${nid}]] 摸清现有实现，[[${idle.id}]] 同步准备测试。`
      : `名册里没有合适的，新起了 [[${nid}]] 先摸清现有实现。`;
    const plain = plainOf(t, { ...state.actors, [nid]: nascent });
    const idx = space.msgs.length + 1;
    update((s) => ({
      spaces: mapSpace(s, sid, (sp) => ({
        ...sp, activeTab: COORD_TAB,
        msgs: [...sp.msgs, { k: "user", t: text }, { k: "coord", t, plain, typing: true }],
      })),
    }));
    streamReply(coordRef(sid, idx), TIMING.typing, () => {
      const lit = idle ? [nid, idle.id] : [nid];
      update((s) => ({
        actors: { ...s.actors, [nid]: nascent },
        spaces: mapSpace(s, sid, (sp) => {
          let next = sp;
          if (idle) {
            next = mapMember(next, idle.id, (m) => ({
              ...m, status: "run", task: short, todo: [0, 3], time: "", note: null,
              transcript: [
                ...m.transcript,
                { k: "task", t: short, at: "刚刚" },
                { k: "brief", t: "为「" + text + "」准备测试，等排查结论出来再补实现相关的用例。" },
                { k: "text", t: "开始了，先列要覆盖的场景。" },
              ],
            }));
          }
          const member: SpaceMember = {
            id: nid, status: "run", task: "排查现有实现", todo: [0, 3], dir: sp.dirs[0] || "checkout-web",
            transcript: [
              { k: "task", t: "排查现有实现", at: "刚刚" },
              { k: "brief", t: text },
              { k: "line", k1: "读取", t: "src/" },
              { k: "text", t: "开始了，有结论会交回协调 Agent。" },
            ],
          };
          return { ...next, members: [member, ...next.members] };
        }),
        ...bumpRows(s, lit),
      }));
      scheduleApproval(sid);
    });
  }

  function sendSolo(raw: string) {
    const text = raw.trim();
    const id = state.chatWith;
    if (!text || state.view !== "chat" || !id) return;
    const reply = "收到。这在我的场景里，我先看一下，有结论直接告诉你。";
    const idx = (state.chats[id] ?? []).length + 1;
    update((s) => ({
      chats: { ...s.chats, [id]: [...(s.chats[id] ?? []), { k: "user", t: text }, { k: "actor", t: reply, plain: reply, typing: true }] },
    }));
    streamReply(soloRef(id, idx), TIMING.soloTyping);
  }

  function afterDecision(s: SpaceDemoState, sid: string, id: string, fn: (m: SpaceMember) => SpaceMember): Partial<SpaceDemoState> {
    const spaces = mapSpace(s, sid, (sp) => mapMember(sp, id, fn));
    const next = { ...s, spaces };
    return { spaces, trayIdx: 0, trayOpen: s.trayOpen && trayList(currentSpace(next), currentTab(next)).length > 0, ...bumpRows(s, []) };
  }

  function approve(id: string) {
    const sp = currentSpace(state);
    const m = findMember(sp, id);
    if (!m || m.status !== "wait") return;
    update((s) => afterDecision(s, sp.id, id, (x) => ({
      ...x, status: "run", ask: null, time: "", denied: false,
      todo: x.todo && x.todo[0] < x.todo[1] ? [x.todo[0] + 1, x.todo[1]] : x.todo,
    })));
    notify("已批准，" + nameOf(state.actors, id) + " 继续了");
  }

  function deny(id: string) {
    const sp = currentSpace(state);
    const m = findMember(sp, id);
    if (!m || m.status !== "wait") return;
    update((s) => afterDecision(s, sp.id, id, (x) => ({
      ...x, status: "idle", last: x.task, note: "命令被拒绝，等你给方向", time: "刚刚", denied: true, ask: null,
    })));
    notify("已拒绝，" + nameOf(state.actors, id) + " 等你给别的方向");
  }

  function openActorTab(id: string) {
    if (state.view !== "space") return;
    const sid = state.spaceId;
    const m = findMember(currentSpace(state), id);
    if (!m) return;
    update((s) => ({
      spaces: mapSpace(s, sid, (sp) => ({
        ...mapMember(sp, id, (x) => ({ ...x, unread: false })),
        openTabs: sp.openTabs.includes(id) ? sp.openTabs : [...sp.openTabs, id],
        activeTab: id,
      })),
    }));
    // 看过「有结果」之后，它滑到「空闲」
    if (m.status === "result") {
      after("space", TIMING.resultSettles, () => {
        if (findMember(state.spaces.find((x) => x.id === sid)!, id)?.status !== "result") return;
        update((s) => ({
          spaces: mapSpace(s, sid, (sp) => mapMember(sp, id, (x) => ({ ...x, status: "idle", last: x.task, task: null }))),
          ...bumpRows(s, []),
        }));
      });
    }
  }

  const setActive = (s: SpaceDemoState, tab: string) =>
    mapSpace(s, s.spaceId, (sp) => ({ ...sp, activeTab: tab }));

  function selectTab(id: string) {
    const sp = currentSpace(state);
    if (id !== COORD_TAB && !sp.openTabs.includes(id)) return;
    update((s) => ({ spaces: setActive(s, id) }));
  }

  function closeTab(id: string) {
    const sp = currentSpace(state);
    const i = sp.openTabs.indexOf(id);
    if (id === COORD_TAB || i < 0) return;
    const rest = sp.openTabs.filter((x) => x !== id);
    // 关掉当前标签：跳到左边那个，没有就回到协调 Agent
    const active = currentTab(state) === id ? rest[i - 1] ?? COORD_TAB : sp.activeTab;
    update((s) => ({ spaces: mapSpace(s, sp.id, (x) => ({ ...x, openTabs: rest, activeTab: active })) }));
  }

  function closeOtherTabs() {
    const tab = currentTab(state);
    update((s) => ({ spaces: mapSpace(s, s.spaceId, (sp) => ({ ...sp, openTabs: tab === COORD_TAB ? [] : [tab], activeTab: tab })) }));
  }

  function switchSpace(id: string) {
    if (!state.spaces.some((s) => s.id === id)) return;
    if (state.view === "space" && state.spaceId === id) return;
    leave();
    update({ spaceId: id, view: "space", trayOpen: false, trayIdx: 0 });
  }

  function goRoster() {
    leave();
    update({ view: "roster", trayOpen: false });
  }

  function openSoloChat(id: string) {
    if (!state.actors[id]) return;
    if (state.view !== "chat" || state.chatWith !== id) leave();
    update((s) => ({
      view: "chat", chatWith: id, chats: { ...s.chats, [id]: s.chats[id] ?? [] },
      soloChats: [id, ...s.soloChats.filter((x) => x !== id)].slice(0, 3), trayOpen: false,
    }));
  }

  const setKeepState = (s: SpaceDemoState, sid: string, aid: string, from: string[], to: "growing" | "kept" | "declined"): Space[] =>
    mapSpace(s, sid, (sp) => ({
      ...sp, msgs: sp.msgs.map((m) => (m.k === "keep" && m.aid === aid && from.includes(m.state) ? { ...m, state: to } : m)),
    }));

  function keepActor(id: string) {
    const sid = state.spaceId;
    const asking = currentSpace(state).msgs.some((m) => m.k === "keep" && m.aid === id && m.state === "ask");
    if (!asking) return;
    update((s) => ({ spaces: setKeepState(s, sid, id, ["ask"], "growing") }));
    // 先播长成动画，再改名册属性
    after("global", TIMING.grow, () => {
      const a = state.actors[id];
      if (!a) return;
      update((s) => ({
        actors: { ...s.actors, [id]: { ...a, nascent: false, img: a.growImg, abilities: ["环境检查", "健康探测"], memN: 1, last: "刚刚长成", spaces: 1 } },
        spaces: setKeepState(s, sid, id, ["growing"], "kept"),
        freshCard: id,
        justGrown: { id, revision: (s.justGrown?.revision ?? 0) + 1 },
      }));
      notify(a.name + " 进入了名册");
    });
  }

  function declineActor(id: string) {
    update((s) => ({ spaces: setKeepState(s, s.spaceId, id, ["ask"], "declined") }));
  }

  function undoMemory(mid: string) {
    update((s) => ({
      spaces: mapSpace(s, s.spaceId, (sp) => ({
        ...sp,
        msgs: sp.msgs.map((m) => (m.k === "mem" && m.mid === mid ? { ...m, undone: true } : m)),
        memory: sp.memory.filter((x) => x.id !== mid),
      })),
    }));
    notify("撤销了这条记忆");
  }

  function forgetMemory(id: string) {
    update((s) => ({ spaces: mapSpace(s, s.spaceId, (sp) => ({ ...sp, memory: sp.memory.filter((x) => x.id !== id) })) }));
    notify("已忘记");
  }

  function createSpace(input: CreateSpaceInput): string {
    const name = input.name.trim() || "未命名 Space";
    const id = "sp" + makeId();
    leave();
    update((s) => ({
      spaces: [...s.spaces, {
        id, name, goal: input.goal.trim(), img: spaceColorAt(s.spaces.length), dirs: input.dirs, instructions: "",
        members: input.crew.map((aid): SpaceMember => ({ id: aid, status: "idle", dir: input.dirs[0] || "checkout-web", transcript: [] })),
        msgs: [], memory: [], library: [], openTabs: [], activeTab: COORD_TAB,
      }],
      spaceId: id, view: "space", trayOpen: false, trayIdx: 0,
    }));
    notify("创建了「" + name + "」");
    return id;
  }

  /* ---------- 右栏 ---------- */
  const withPanel = (fn: (p: PanelState) => PanelState | null) => {
    const key = panelKey(state);
    const panel = key ? panelFor(state) : null;
    if (!key || !panel) return;
    const next = fn(panel);
    if (next) update((s) => ({ panels: { ...s.panels, [key]: next } }));
  };

  function openPanelTab(kind: PanelKind, extra?: { path?: string; label?: string }) {
    const id = extra?.path ? "file:" + extra.path : kind;
    withPanel((p) => ({
      tabs: p.tabs.some((t) => t.id === id) ? p.tabs : [...p.tabs, { id, kind, ...extra }],
      active: id,
    }));
    if (panelKey(state)) update({ panelOpen: true });
  }

  function selectPanelTab(id: string) {
    withPanel((p) => (p.tabs.some((t) => t.id === id) ? { ...p, active: id } : null));
  }

  function closePanelTab(id: string) {
    withPanel((p) => {
      const i = p.tabs.findIndex((t) => t.id === id);
      if (i < 0) return null;
      const tabs = p.tabs.filter((t) => t.id !== id);
      // 关当前：先跳左边，没有左边就取剩下的第一个，都没有就显示启动页
      return { tabs, active: p.active === id ? (tabs[i - 1] ?? tabs[0])?.id ?? null : p.active };
    });
  }

  function trayStep(delta: number) {
    const n = trayList(currentSpace(state), currentTab(state)).length;
    if (n) update((s) => ({ trayIdx: (s.trayIdx + delta + n) % n }));
  }

  const actions: SpaceDemoActions = {
    send, sendSolo, approve, deny, openActorTab, selectTab, closeTab, closeOtherTabs, switchSpace,
    goRoster, openSoloChat, keepActor, declineActor, undoMemory, forgetMemory, createSpace,
    toggleGroup: (status) => update((s) => ({ collapsed: { ...s.collapsed, [status]: !s.collapsed[status] } })),
    openPanelTab, selectPanelTab, closePanelTab,
    togglePanel: () => update((s) => ({ panelOpen: !s.panelOpen })),
    setPanelOpen: (open) => update({ panelOpen: open }),
    showActorsPanel: () => { selectTab(COORD_TAB); openPanelTab("actors"); },
    toggleTray: () => update((s) => ({ trayOpen: !s.trayOpen })),
    closeTray: () => update({ trayOpen: false }),
    trayPrev: () => trayStep(-1),
    trayNext: () => trayStep(1),
    trayView: (id) => { update({ trayOpen: false }); openActorTab(id); },
    toggleFileDir: (path) => update((s) => ({ ftOpen: s.ftOpen.includes(path) ? s.ftOpen.filter((p) => p !== path) : [...s.ftOpen, path] })),
    setFileQuery: (query) => update({ ftQuery: query }),
    openFile: (path) => {
      update({ ftSelected: path });
      openPanelTab("file", { path, label: path.split("/").pop() });
    },
    setRosterQuery: (query) => update({ rosterQuery: query }),
    showNotice: notify,
    dismissNotice: () => update({ notice: null }),
    clearFreshCard: () => { if (state.freshCard) update({ freshCard: null }); },
    clearJustGrown: () => { if (state.justGrown) update({ justGrown: null }); },
    reset: () => {
      leave();
      resetEpoch += 1;
      clearScope("global");
      noticeTimer = null;
      state = initialState();
      emit();
      notify("演示已重置");
    },
  };

  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    actions,
    panelKey: () => panelKey(state),
    panelOpen: () => state.panelOpen && state.view !== "roster",
    dispose() { spaceEpoch += 1; resetEpoch += 1; clearScope("space"); clearScope("global"); },
  };
}

const hashCode = (id: string): number => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/**
 * 全局单例，只在内存里，刷新即回到 fixtures。
 * `@__PURE__` 告诉打包器这次调用没有副作用：生产构建里没人用到单例时，store 和 fixtures 一起删掉。
 */
export const spaceDemoStore: SpaceDemoStore = /* @__PURE__ */ createSpaceDemoStore();
