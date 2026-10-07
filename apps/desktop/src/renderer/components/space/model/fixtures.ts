// demo 的 seed 数据，文案逐字照搬。每次调用返回新对象，reset 时重新生成。
import type { CoordinatorMessage, RosterActor, Space, SpaceMember } from "./types";

type ActorSeed = Omit<RosterActor, "id">;

function actorSeeds(): Record<string, ActorSeed> {
  return {
    be: { name: "后端", img: 2, scene: "服务端代码：接口、数据访问和迁移。", abilities: ["TypeScript", "SQL 迁移", "单元测试"], memN: 23, last: "今天聊过", spaces: 2 },
    fe: { name: "前端", img: 5, scene: "Web 界面和交互，偏 React。", abilities: ["React", "状态管理", "浏览器"], memN: 18, last: "今天聊过", spaces: 2 },
    perf: { name: "性能分析", img: 1, scene: "找出慢在哪里。只读，不改代码。", abilities: ["日志检索", "EXPLAIN", "火焰图"], memN: 9, last: "今天聊过", spaces: 1 },
    tester: { name: "测试员", img: 3, scene: "只关心测试：补测试，修不稳定的测试。", abilities: ["Vitest", "覆盖率", "快照"], memN: 31, last: "昨天聊过", spaces: 3 },
    reviewer: { name: "审查员", img: 8, scene: "读 diff，挑出风险和前后不一致的地方。", abilities: ["Diff 阅读", "安全检查", "风格规则"], memN: 14, last: "3 天前聊过", spaces: 2 },
    docs: { name: "文档", img: 6, scene: "把结论写成别人看得懂的文档。", abilities: ["Markdown", "图表", "术语表"], memN: 7, last: "上周聊过", spaces: 1 },
    db: { name: "数据库", img: 4, scene: "表结构、索引和查询计划。", abilities: ["PostgreSQL", "索引设计", "迁移审查"], memN: 11, last: "周一聊过", spaces: 1 },
    ui: { name: "界面还原", img: 7, scene: "按设计稿还原界面细节。", abilities: ["CSS", "设计 token", "截图对比"], memN: 6, last: "上周聊过", spaces: 1 },
    // 下面两个是协调 Agent 在 Space 里新起的，留下之前只属于那个 Space
    env: { name: "环境巡检", nascent: true, growImg: 9, scene: "确认测试环境能不能用。", abilities: [] },
    load: { name: "回归压测", nascent: true, growImg: 4, scene: "写 k6 回归压测脚本。", abilities: [] },
  };
}

export function createActors(): Record<string, RosterActor> {
  const out: Record<string, RosterActor> = {};
  for (const [id, seed] of Object.entries(actorSeeds())) out[id] = { id, ...seed };
  return out;
}

function sp1Members(): SpaceMember[] {
  return [
    {
      id: "be", status: "wait", task: "quote N+1 修复", ask: "批准新索引的迁移", todo: [4, 6], time: "3 分钟", dir: "payments-api",
      approval: { cmd: "pnpm db:migrate --env staging-2", why: "在 staging-2 建 (sku, region) 复合索引。依据 Space 记忆：压测和迁移只用 staging-2。" },
      transcript: [
        { k: "task", t: "quote N+1 修复", at: "10:41" },
        { k: "brief", t: "改 /checkout/quote 的 N+1：按 SKU 批量查价格表，补一条 (sku, region) 复合索引的迁移，跑 quote 相关单测。" },
        { k: "line", k1: "读取", t: "src/quote/service.ts" },
        { k: "line", k1: "搜索", t: "priceTable.find · 7 处" },
        { k: "line", k1: "编辑", t: "src/quote/service.ts", diff: [24, 9] },
        { k: "line", k1: "新建", t: "migrations/20261002_quote_sku_idx.sql", diff: [8, 0] },
        { k: "line", k1: "运行", t: "pnpm test quote · 18 通过" },
        { k: "text", t: "批量查询改好了，单测全通过。接下来要在 staging-2 建索引，再用冒烟压测确认收益。" },
        { k: "approval" },
      ],
    },
    {
      id: "fe", status: "run", task: "web 端报价缓存", todo: [3, 5], dir: "checkout-web",
      transcript: [
        { k: "task", t: "web 端报价缓存", at: "10:41" },
        { k: "brief", t: "在 checkout-web 给报价请求加 30 秒内存缓存，购物车变化时失效。" },
        { k: "line", k1: "读取", t: "src/hooks/useQuote.ts" },
        { k: "line", k1: "搜索", t: "fetchQuote · 4 处" },
        { k: "sync", t: "已同步 1 条新记忆" },
        { k: "line", k1: "编辑", t: "src/hooks/useQuote.ts", diff: [18, 4] },
        { k: "text", t: "缓存接上了，正在补「购物车变化时失效」的测试。" },
      ],
    },
    {
      id: "load", status: "run", task: "回归压测脚本", todo: [1, 4], dir: "payments-api", tree: "space/load-test",
      transcript: [
        { k: "task", t: "回归压测脚本", at: "10:41" },
        { k: "brief", t: "写一个 k6 回归压测脚本，覆盖 quote 和 submit，目标环境 staging-2。" },
        { k: "line", k1: "隔离", t: "payments-api 已有 Actor 在写，这里用工作树 space/load-test" },
        { k: "line", k1: "读取", t: "library/added/k6-场景说明.md" },
        { k: "line", k1: "新建", t: "load/quote.js", diff: [46, 0] },
        { k: "text", t: "正在写 quote 场景，接下来是 submit。" },
      ],
    },
    {
      id: "perf", status: "result", task: "慢查询分析", todo: [3, 3], time: "1 小时", unread: true, dir: "payments-api",
      transcript: [
        { k: "task", t: "建立基线跑分", at: "09:13" },
        { k: "brief", t: "在 staging-2 跑 checkout 全链路基线，输出 p75 / p95。" },
        { k: "line", k1: "运行", t: "k6 run load/baseline.js --env staging-2" },
        { k: "line", k1: "写入库", t: "artifacts/baseline-2026-10-02.md" },
        { k: "text", t: "基线 p75 312ms，p95 640ms。/checkout/quote 是最慢的接口。" },
        { k: "done", t: "建立基线跑分", at: "09:41" },
        { k: "task", t: "慢查询分析", at: "09:42" },
        { k: "brief", t: "读 staging-2 最近 24 小时的慢查询日志，找出最重的几条。只读。" },
        { k: "line", k1: "读取", t: "logs/slow-2026-10-01.log" },
        { k: "line", k1: "搜索", t: "priceTable.find" },
        { k: "line", k1: "写入库", t: "artifacts/slow-queries.md" },
        { k: "text", t: "最重的是 quote 的价格查询：每个商品查一次，平均 14 次 / 请求，占 p75 的 61%。" },
        { k: "line", k1: "提议记忆", t: "压测和迁移只用 staging-2 → 协调 Agent 已记下" },
        { k: "done", t: "慢查询分析", at: "09:58" },
      ],
    },
    {
      id: "env", status: "idle", last: "确认压测环境", time: "09:20", dir: "payments-api",
      transcript: [
        { k: "task", t: "确认压测环境", at: "09:13" },
        { k: "brief", t: "确认 staging-2 现在能不能跑压测。" },
        { k: "line", k1: "运行", t: "curl -s staging-2/health" },
        { k: "text", t: "staging-2 可用，当前没有别的压测任务占用。" },
        { k: "done", t: "确认压测环境", at: "09:20" },
      ],
    },
    { id: "tester", status: "idle", dir: "payments-api", transcript: [] },
  ];
}

// 种子里的引用只涉及这几个 Actor，直接查表，避免 fixtures 依赖 selectors
const SEED_NAMES: Record<string, string> = { perf: "性能分析", env: "环境巡检", be: "后端", fe: "前端", load: "回归压测" };
const plainOfSeed = (text: string): string => text.replace(/\[\[(\w+)\]\]/g, (_, id: string) => SEED_NAMES[id] ?? id);
const coord = (t: string): CoordinatorMessage => ({ k: "coord", t, plain: plainOfSeed(t) });

function sp1Msgs(): CoordinatorMessage[] {
  return [
    { k: "div", t: "今天 09:12" },
    { k: "user", t: "先把 checkout 链路的基线跑出来，同时看一下慢查询日志里最重的几条。" },
    coord("基线和慢查询都交给 [[perf]]，先跑基线再翻日志。名册里没有管环境的，我新起了 [[env]] 去确认 staging-2 能不能用。"),
    { k: "div", t: "10:40" },
    { k: "user", t: "按慢查询的结论修 quote 的 N+1，web 端的报价请求也加个缓存。再补一个回归压测脚本。" },
    coord("N+1 交给 [[be]]，缓存交给 [[fe]]。压测脚本新起了 [[load]]，放在工作树 space/load-test，免得和 [[be]] 改到同一处。"),
    { k: "mem", mid: "m1", t: "压测和迁移只用 staging-2，staging-1 是对外演示环境。" },
    { k: "keep", aid: "env", state: "ask" },
  ];
}

export function createSpaces(): Space[] {
  const sp1: Space = {
    id: "sp1", name: "支付链路提速", img: "peach", goal: "把 checkout 链路的 p75 降到 200ms 以内",
    dirs: ["payments-api", "checkout-web"],
    instructions: "改价格表结构前先在协调 Agent 里确认。\n代码改动要带对应单测。\n性能结论要写出测量命令和环境。",
    members: sp1Members(),
    msgs: sp1Msgs(),
    memory: [
      { id: "m1", t: "压测和迁移只用 staging-2，staging-1 是对外演示环境。", src: "来自 性能分析 · 今天 09:58" },
      { id: "m2", t: "checkout 的性能目标以 p75 为准，p95 只作参考。", src: "你在协调 Agent 说的 · 周一" },
      { id: "m3", t: "改 payments-api 价格表结构前，先在协调 Agent 里确认。", src: "你在协调 Agent 说的 · 周一" },
    ],
    library: [
      { id: "f1", name: "baseline-2026-10-02.md", kind: "artifact", src: "性能分析", date: "今天 09:41" },
      { id: "f2", name: "slow-queries.md", kind: "artifact", src: "性能分析", date: "今天 09:58" },
      { id: "f4", name: "checkout-sla.pdf", kind: "added", date: "周一" },
      { id: "f5", name: "k6-场景说明.md", kind: "added", date: "周一" },
    ],
    openTabs: [],
    activeTab: "coord",
  };
  const sp2: Space = {
    id: "sp2", name: "结算页重构", img: "forest", goal: "把结算页拆成可独立发布的模块",
    dirs: ["checkout-web"], instructions: "",
    members: [
      { id: "fe", status: "idle", dir: "checkout-web", transcript: [] },
      { id: "reviewer", status: "idle", dir: "checkout-web", transcript: [] },
      { id: "docs", status: "idle", dir: "checkout-web", transcript: [] },
    ],
    msgs: [], memory: [], library: [],
    openTabs: [], activeTab: "coord",
  };
  return [sp1, sp2];
}

/** 文件树默认展开的目录（demo 的 ftOpen） */
export const DEFAULT_OPEN_DIRS: readonly string[] = [
  "payments-api", "payments-api/src", "payments-api/src/quote",
  "checkout-web", "checkout-web/src", "checkout-web/src/hooks",
];
