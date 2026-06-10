import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scanWatchPath } from "./watch-scanner";

const MAX_DIFF_ITEMS_PER_PATH = 50;

export interface WatchDiffEntry {
  rootPath: string;
  added: string[];                                   // 完整路径
  removed: string[];                                 // 完整路径
  truncated: boolean;
  totalAdded: number;                                // 截断前真实数量
  totalRemoved: number;
}

export interface WatchManifest {
  path: string;
  entries: string[];                                 // 相对 path 的文件名，升序
  lastScanAt: string;
}

/** `computeDiff` 的返回：diff 条目 + 本次扫描全量（提交 manifest 时用）。 */
export interface WatchDiffComputation {
  entry: WatchDiffEntry;
  /** 本次扫描的完整相对路径列表；`commitManifest` 必须用它而不是重扫。 */
  scannedEntries: string[];
}

/**
 * watch 路径的"上次扫描快照"管理 + 差集计算。
 *
 * Manifest 文件名 = SHA1(rootPath) 前 12 位 + ".json"，
 * 同一路径每次扫描读取/覆盖同一个 manifest；rename 路径自动失效（hash 变）。
 *
 * 写入采用 tmp + rename 的原子写法，避免半文件损坏。
 *
 * 计算与提交分离（观测增量化）：`computeDiff` 只读不写；`commitManifest` 由调用方
 * 在 tick 正常闭合后调用。失败 tick 不提交 → 下个 tick 重新看到同一批增量。
 * 上下文快照（getContextSnapshot）只 compute 不 commit，避免"看一眼就吃掉观测"。
 */
export class WatchDiffEngine {
  private readonly manifestDir: string;

  constructor(manifestDir: string) {
    this.manifestDir = manifestDir;
  }

  /** 只读计算 diff；不写 manifest。 */
  async computeDiff(rootPath: string): Promise<WatchDiffComputation> {
    const scan = await scanWatchPath(rootPath);
    const newEntries = scan.entries;
    const oldEntries = await this.loadManifest(rootPath);

    const oldSet = new Set(oldEntries);
    const newSet = new Set(newEntries);

    const addedRel: string[] = [];
    const removedRel: string[] = [];
    for (const e of newEntries) if (!oldSet.has(e)) addedRel.push(e);
    for (const e of oldEntries) if (!newSet.has(e)) removedRel.push(e);

    const totalAdded = addedRel.length;
    const totalRemoved = removedRel.length;

    // 截断：added 优先；剩余空间补 removed
    let truncated = false;
    let visibleAdded = addedRel;
    let visibleRemoved = removedRel;
    if (totalAdded + totalRemoved > MAX_DIFF_ITEMS_PER_PATH) {
      truncated = true;
      const addedSlot = Math.min(totalAdded, MAX_DIFF_ITEMS_PER_PATH);
      const removedSlot = Math.max(0, MAX_DIFF_ITEMS_PER_PATH - addedSlot);
      visibleAdded = addedRel.slice(0, addedSlot);
      visibleRemoved = removedRel.slice(0, removedSlot);
    }

    return {
      entry: {
        rootPath,
        added: visibleAdded.map((rel) => join(rootPath, rel)),
        removed: visibleRemoved.map((rel) => join(rootPath, rel)),
        truncated,
        totalAdded,
        totalRemoved,
      },
      scannedEntries: newEntries,
    };
  }

  /** 提交本次扫描快照；必须传 `computeDiff` 返回的 `scannedEntries`（不重扫，避免吞掉 tick 期间的变化）。 */
  async commitManifest(rootPath: string, scannedEntries: string[]): Promise<void> {
    await this.saveManifest(rootPath, scannedEntries);
  }

  /** compute + commit 一步到位；仅供不关心提交时序的调用方（如测试）使用。 */
  async diff(rootPath: string): Promise<WatchDiffEntry> {
    const { entry, scannedEntries } = await this.computeDiff(rootPath);
    await this.saveManifest(rootPath, scannedEntries);
    return entry;
  }

  /** 获取一个 rootPath 对应的 manifest 文件路径（外部调试用）。 */
  manifestPath(rootPath: string): string {
    return join(this.manifestDir, `${hashPath(rootPath)}.json`);
  }

  private async loadManifest(rootPath: string): Promise<string[]> {
    try {
      const raw = await readFile(this.manifestPath(rootPath), "utf8");
      const parsed = JSON.parse(raw) as WatchManifest;
      if (parsed && Array.isArray(parsed.entries)) {
        return parsed.entries.filter((e): e is string => typeof e === "string");
      }
    } catch {
      // 不存在 / 损坏：当作空 manifest，触发"首次扫描全为 added"
    }
    return [];
  }

  private async saveManifest(rootPath: string, entries: string[]): Promise<void> {
    await mkdir(this.manifestDir, { recursive: true });
    const manifest: WatchManifest = {
      path: rootPath,
      entries: [...entries].sort(),
      lastScanAt: new Date().toISOString(),
    };
    const finalPath = this.manifestPath(rootPath);
    const tmpPath = `${finalPath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
    await rename(tmpPath, finalPath);
  }
}

function hashPath(rootPath: string): string {
  return createHash("sha1").update(rootPath).digest("hex").slice(0, 12);
}
