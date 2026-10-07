// 右栏 mock 内容：文件树、示例代码、终端输出、Review diff、上下文用量。
// 终端、Review、用量都由成员对话推出来，规则照搬 demo。
import type { SpaceMember } from "./types";

export interface FsNode {
  n: string;
  c?: FsNode[];
}

export const FS: Record<string, FsNode[]> = {
  "payments-api": [
    { n: "load", c: [{ n: "baseline.js" }, { n: "quote.js" }] },
    { n: "migrations", c: [{ n: "20261002_quote_sku_idx.sql" }] },
    { n: "src", c: [{ n: "quote", c: [{ n: "service.ts" }, { n: "service.test.ts" }] }, { n: "index.ts" }] },
    { n: "package.json" },
    { n: "README.md" },
  ],
  "checkout-web": [
    { n: "src", c: [{ n: "hooks", c: [{ n: "useQuote.ts" }, { n: "useQuote.test.ts" }] }, { n: "pages", c: [{ n: "Checkout.tsx" }] }] },
    { n: "package.json" },
  ],
};

/** 按文件名查内容；没有的文件用 `fallbackCode` */
export const CODE: Record<string, string[]> = {
  "service.ts": [
    "import { db } from '../db';",
    "import type { Quote, QuoteItem } from './types';",
    "",
    "export async function quote(items: QuoteItem[], region: string): Promise<Quote> {",
    "  // 一次按 SKU 批量查价格，替代逐个查询",
    "  const skus = items.map((it) => it.sku);",
    "  const prices = await db.priceTable.findMany({",
    "    where: { sku: { in: skus }, region },",
    "  });",
    "  const bySku = new Map(prices.map((p) => [p.sku, p]));",
    "  const lines = items.map((it) => ({",
    "    sku: it.sku,",
    "    qty: it.qty,",
    "    unit: bySku.get(it.sku)?.amount ?? 0,",
    "  }));",
    "  return { region, lines, total: lines.reduce((s, l) => s + l.unit * l.qty, 0) };",
    "}",
  ],
  "useQuote.ts": [
    "import { useEffect, useState } from 'react';",
    "import { fetchQuote, type Quote } from '../api';",
    "",
    "const TTL = 30_000;",
    "const cache = new Map<string, { at: number; value: Quote }>();",
    "",
    "export function useQuote(cartKey: string) {",
    "  const [quote, setQuote] = useState<Quote | null>(null);",
    "  useEffect(() => {",
    "    const hit = cache.get(cartKey);",
    "    if (hit && Date.now() - hit.at < TTL) return setQuote(hit.value);",
    "    fetchQuote(cartKey).then((value) => {",
    "      cache.set(cartKey, { at: Date.now(), value });",
    "      setQuote(value);",
    "    });",
    "  }, [cartKey]);",
    "  return quote;",
    "}",
  ],
  "20261002_quote_sku_idx.sql": [
    "-- quote 按 (sku, region) 批量查价格",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS price_table_sku_region_idx",
    "  ON price_table (sku, region);",
  ],
  "quote.js": [
    "import http from 'k6/http';",
    "import { check } from 'k6';",
    "",
    "export const options = {",
    "  vus: 20,",
    "  duration: '2m',",
    "  thresholds: { 'http_req_duration{name:quote}': ['p(75)<200'] },",
    "};",
    "",
    "export default function () {",
    "  const res = http.post(`${__ENV.BASE}/checkout/quote`, JSON.stringify({ items: [{ sku: 'A1', qty: 2 }] }), {",
    "    headers: { 'Content-Type': 'application/json' },",
    "    tags: { name: 'quote' },",
    "  });",
    "  check(res, { 'status 200': (r) => r.status === 200 });",
    "}",
  ],
};

export function codeFor(path: string): string[] {
  const name = path.split("/").pop() ?? path;
  return CODE[name] ?? ["// " + path, "// 演示里只放了几份示例文件的内容"];
}

/** 文件树行：目录或文件，depth 用于缩进 */
export interface FileRow {
  path: string;
  name: string;
  depth: number;
  dir: boolean;
  root?: boolean;
}

const flatten = (nodes: FsNode[], base: string): string[] =>
  nodes.flatMap((nd) => (nd.c ? flatten(nd.c, `${base}/${nd.n}`) : [`${base}/${nd.n}`]));

/** 按展开集合和过滤词算出文件树要显示的行。有过滤词时只列匹配的文件（完整路径当名字） */
export function fileRows(roots: string[], open: readonly string[], query: string): FileRow[] {
  const rows: FileRow[] = [];
  const isOpen = (p: string) => open.includes(p);
  const walk = (nodes: FsNode[], base: string, depth: number) => {
    for (const nd of nodes) {
      const path = `${base}/${nd.n}`;
      if (!nd.c) { rows.push({ path, name: nd.n, depth, dir: false }); continue; }
      rows.push({ path, name: nd.n, depth, dir: true });
      if (isOpen(path)) walk(nd.c, path, depth + 1);
    }
  };
  const q = query.trim().toLowerCase();
  for (const root of roots) {
    if (q) {
      for (const p of flatten(FS[root] ?? [], root)) if (p.toLowerCase().includes(q)) rows.push({ path: p, name: p, depth: 0, dir: false });
      continue;
    }
    rows.push({ path: root, name: root, depth: 0, dir: true, root: true });
    if (isOpen(root)) walk(FS[root] ?? [], root, 1);
  }
  return rows;
}

/** 终端：协调 Agent 不执行命令，Actor 下能看到它跑过的命令 */
export interface TerminalLine {
  kind: "dim" | "cmd";
  text: string;
  /** 命令的结果，如「18 通过」 */
  result?: string;
}

export function terminalLines(input: { coord: boolean; member?: SpaceMember; memberName?: string }): TerminalLine[] {
  if (input.coord) return [{ kind: "dim", text: "Space 终端 · 只给你用，协调 Agent 不会在这里执行命令" }];
  const m = input.member;
  if (!m) return [];
  const runs = m.transcript.filter((b) => b.k === "line" && b.k1 === "运行");
  const out: TerminalLine[] = runs.length
    ? runs.map((b) => {
        const [cmd, result] = (b as { t: string }).t.split(" · ");
        return { kind: "cmd" as const, text: cmd, result };
      })
    : [{ kind: "dim", text: `${input.memberName ?? m.id} 还没有运行过命令` }];
  if (m.status === "wait" && m.approval) out.push({ kind: "dim", text: `# 等你批准：${m.approval.cmd}` });
  return out;
}

/** Review：Actor 对话里带 diff 的行 */
export interface ReviewFile {
  name: string;
  add: number;
  del: number;
}

export function reviewFiles(m: SpaceMember | undefined): ReviewFile[] {
  if (!m) return [];
  const out: ReviewFile[] = [];
  for (const b of m.transcript) if (b.k === "line" && b.diff) out.push({ name: b.t, add: b.diff[0], del: b.diff[1] });
  return out;
}

export interface UsagePart {
  name: string;
  /** 单位 k token */
  value: number;
  tone: "neutral" | "info" | "operational" | "warning";
}

export interface ContextUsage {
  parts: UsagePart[];
  total: number;
  max: number;
  pct: number;
}

export function contextUsage(input: {
  coord: boolean;
  inSpace: boolean;
  memoryCount: number;
  /** 对话条数：成员对话块、协调 Agent 消息或一对一消息 */
  messageCount: number;
  /** Actor 对话里的工具行数；非 Actor 传 0 */
  toolLines: number;
  isMember: boolean;
}): ContextUsage {
  const parts: UsagePart[] = [
    { name: "系统提示", value: input.coord ? 4.8 : 6.2, tone: "neutral" },
    { name: input.inSpace ? "Space 指令与记忆" : "自己的记忆", value: input.inSpace ? 1.6 + input.memoryCount * 0.4 : 2.4, tone: "info" },
    { name: "对话", value: 2 + input.messageCount * 2.4, tone: "operational" },
    { name: "工具结果", value: input.isMember ? input.toolLines * 3.1 : input.coord ? 3.2 : 0, tone: "warning" },
  ];
  const total = parts.reduce((s, x) => s + x.value, 0);
  const max = 200;
  return { parts, total, max, pct: Math.round((total / max) * 100) };
}
