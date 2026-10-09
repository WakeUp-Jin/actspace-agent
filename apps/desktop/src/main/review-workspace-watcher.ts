import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * `path` is a checkout-relative file that only matters if Git does not ignore it.
 * No argument means the change must refresh Review (Git metadata, ignore rules, unknown file name).
 */
export type ReviewWatchChanged = (path?: string) => void;

/** Watch only roots that have been authorized and opened in Review. */
export class ReviewWorkspaceWatcher {
  private readonly roots = new Map<string, Promise<FSWatcher[]>>();
  private disposed = false;

  async ensure(workspaceId: string, workspaceRoot: string, changed: ReviewWatchChanged): Promise<void> {
    if (this.disposed) return;
    const key = `${workspaceId}:${workspaceRoot}`;
    let pending = this.roots.get(key);
    if (!pending) {
      pending = this.open(workspaceRoot, changed);
      this.roots.set(key, pending);
    }
    try { await pending; }
    catch (error) { this.roots.delete(key); throw error; }
  }

  private async open(root: string, changed: ReviewWatchChanged): Promise<FSWatcher[]> {
    const targets = new Map<string, boolean>([[resolve(root), false]]);
    // Linked worktrees keep HEAD/index outside the checkout; common refs live elsewhere too.
    const gitFile = await readFile(resolve(root, ".git"), "utf8").catch(() => "");
    const match = /^gitdir:\s*(.+)\s*$/m.exec(gitFile);
    if (match) {
      const gitDir = resolve(root, match[1]!.trim());
      targets.set(gitDir, true);
      const common = await readFile(resolve(gitDir, "commondir"), "utf8").catch(() => "");
      if (common.trim()) targets.set(resolve(gitDir, common.trim()), true);
    }
    const watchers: FSWatcher[] = [];
    if (this.disposed) return watchers;
    try {
      for (const [path, metadata] of targets) {
        // The checkout watcher already covers an in-tree metadata directory.
        if (metadata && inside(root, path)) continue;
        const watcher = watch(path, { recursive: true, persistent: false }, (_event, filename) => {
          if (this.disposed) return;
          const name = filename?.toString().replaceAll("\\", "/");
          if (name && !relevantChange(name, metadata)) return;
          if (name && !metadata && ignoreCandidate(name)) changed(name);
          else changed();
        });
        // Losing a watched directory must not become an uncaught Electron exception.
        watcher.on("error", () => { watcher.close(); if (!this.disposed) changed(); });
        watchers.push(watcher);
      }
      return watchers;
    } catch (error) {
      for (const watcher of watchers) watcher.close();
      throw error;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const pending of this.roots.values()) void pending.then(watchers => watchers.forEach(watcher => watcher.close()), () => {});
    this.roots.clear();
  }
}

function inside(root: string, path: string): boolean {
  const name = relative(resolve(root), path);
  return name === "" || (!name.startsWith("..") && !isAbsolute(name));
}

/** Checkout files can be filtered by Git ignore rules; metadata and ignore-rule files cannot. */
function ignoreCandidate(name: string): boolean {
  if (name === ".git" || name.startsWith(".git/")) return false;
  const base = name.slice(name.lastIndexOf("/") + 1);
  return base !== ".gitignore";
}

function relevantChange(name: string, metadata: boolean): boolean {
  const gitPath = metadata ? name : name.startsWith(".git/") ? name.slice(5) : undefined;
  // Git status/index refresh creates lock noise. Only final index/HEAD/refs matter.
  if (gitPath !== undefined) return !gitPath.endsWith(".lock") && (
    ["HEAD", "index", "packed-refs", "config", "commondir"].includes(gitPath)
    || gitPath.startsWith("refs/") || gitPath === "info/exclude"
  );
  return true;
}
