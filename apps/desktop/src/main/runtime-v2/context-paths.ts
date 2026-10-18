import { CONTEXT_ACTIVE_PATH_LIMIT, selectNextActivePathIds } from "@actspace/shared";
import type { ContextDisclosureSummary, ContextPathEntry, ContextPathsInput, ContextPathsPage, ManagedContextProjection } from "@actspace/shared";

const snapshots = new WeakMap<ManagedContextProjection, ContextPathEntry[]>();
const groups = new WeakMap<readonly ContextPathEntry[], Record<"active" | "sleeping", ContextPathEntry[]>>();
export function disclosurePaths(projection: ManagedContextProjection | null): ContextPathEntry[] | null {
  const owners = projection?.status.plugins["actspace.context.owners"];
  if (!projection || !Array.isArray(owners) || !owners.includes("actspace.context-disclosure")) return null;
  const cached = snapshots.get(projection);
  if (cached) return cached;
  const raw = projection.status.paths as unknown as ContextPathEntry[];
  const nextActive = new Set(selectNextActivePathIds(raw, projection.status.cycle));
  const paths = raw.map((path): ContextPathEntry => {
    const forecast = path.visibility === "active" ? (nextActive.has(path.id) ? undefined : "sleep") : (nextActive.has(path.id) ? "wake" : undefined);
    return { id: path.id, path: path.path, ...(path.description ? { description: path.description } : {}),
      owners: [...path.owners], visibility: path.visibility, readsInCycle: path.readsInCycle, addedCycle: path.addedCycle,
      ...(path.lastReadAt ? { lastReadAt: path.lastReadAt } : {}), ...(forecast ? { nextCompaction: forecast } : {}) };
  });
  snapshots.set(projection, paths);
  return paths;
}
export function disclosureSummary(projection: ManagedContextProjection | null, revision: string): ContextDisclosureSummary {
  const paths = disclosurePaths(projection);
  return paths === null ? { status: "unavailable" } : { status: "ready", revision, cycle: projection!.status.cycle,
    activeLimit: CONTEXT_ACTIVE_PATH_LIMIT, activeCount: paths.filter(path => path.visibility === "active").length, sleepingCount: paths.filter(path => path.visibility === "sleeping").length };
}
export function contextPathsPage(paths: readonly ContextPathEntry[], input: ContextPathsInput): ContextPathsPage {
  if (input.visibility !== "active" && input.visibility !== "sleeping") throw new Error("Invalid Context path visibility.");
  if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1)) throw new Error("Invalid Context page limit.");
  const query = JSON.stringify([input.sessionId, input.revision, input.visibility]);
  let offset = 0;
  if (input.cursor) {
    try {
      if (input.cursor.length > 4096) throw new Error();
      const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (parsed.query !== query || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error();
      offset = parsed.offset;
    } catch { throw new Error("Context path cursor invalid; reload the panel."); }
  }
  let grouped = groups.get(paths);
  if (!grouped) {
    const compare = (a: ContextPathEntry, b: ContextPathEntry) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id);
    grouped = { active: paths.filter(path => path.visibility === "active").sort(compare), sleeping: paths.filter(path => path.visibility === "sleeping").sort(compare) };
    groups.set(paths, grouped);
  }
  const filtered = grouped[input.visibility];
  if (offset > filtered.length) throw new Error("Context path cursor invalid; reload the panel.");
  const selected: ContextPathEntry[] = [];
  let size = 0;
  for (const path of filtered.slice(offset, offset + Math.min(100, input.limit ?? 50))) {
    const bytes = Buffer.byteLength(JSON.stringify(path));
    if (size + bytes > 192 * 1024) {
      if (!selected.length) throw new Error("Context path exceeds page budget.");
      break;
    }
    selected.push(path); size += bytes;
  }
  const end = offset + selected.length;
  return { revision: input.revision, visibility: input.visibility, total: filtered.length, paths: selected,
    ...(end < filtered.length ? { nextCursor: Buffer.from(JSON.stringify({ query, offset: end })).toString("base64url") } : {}) };
}
