import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

export interface CoverFs {
  readdir(path: string): Promise<readonly string[]>;
  lstat(path: string): Promise<{ readonly isDirectory: boolean; readonly isSymbolicLink: boolean }>;
  /** Follows symlinks to the canonical target; rejects when the target is missing. */
  resolve(path: string): Promise<{ readonly path: string; readonly isDirectory: boolean }>;
}
export type ReadCover = { readonly directories: readonly string[]; readonly files: readonly string[] };

export const nodeCoverFs: CoverFs = Object.freeze({
  readdir: (path: string) => readdir(path),
  lstat: async (path: string) => { const entry = await lstat(path); return { isDirectory: entry.isDirectory(), isSymbolicLink: entry.isSymbolicLink() }; },
  resolve: async (path: string) => { const target = await realpath(path); return { path: target, isDirectory: (await stat(target)).isDirectory() }; },
});

/**
 * Read grants for everything under `roots` except `excluded`, in a form nono accepts: it refuses grants that are
 * parents of its own state roots and ignores manifest denies, so every ancestor of an excluded path is split into
 * its children instead of being granted whole. Paths must be canonical. Unreadable directories and dangling
 * symlinks are left out, since nono fails on paths that do not exist.
 */
export async function coverReadable(roots: readonly string[], excluded: readonly string[], fs: CoverFs = nodeCoverFs): Promise<ReadCover> {
  const directories: string[] = [];
  const files: string[] = [];
  const isExcluded = (path: string) => excluded.some(denied => contains(denied, path));
  const isAncestor = (path: string) => excluded.some(denied => contains(path, denied));
  async function visit(directory: string): Promise<void> {
    if (isExcluded(directory)) return;
    if (!isAncestor(directory)) { directories.push(directory); return; }
    let names: readonly string[];
    try { names = await fs.readdir(directory); } catch { return; }
    for (const name of [...names].sort()) {
      const path = join(directory, name);
      if (isExcluded(path)) continue;
      let entry;
      try { entry = await fs.lstat(path); } catch { continue; }
      if (!entry.isSymbolicLink) {
        if (entry.isDirectory) await visit(path); else files.push(path);
        continue;
      }
      let target;
      try { target = await fs.resolve(path); } catch { continue; }
      // nono grants the canonical target, so a link into or above an excluded path would undo the exclusion.
      if (isExcluded(target.path) || isAncestor(target.path)) continue;
      (target.isDirectory ? directories : files).push(path);
    }
  }
  for (const root of [...new Set(roots)].sort()) await visit(root);
  return { directories, files };
}

export function contains(root: string, candidate: string): boolean { const nested = relative(root, candidate); return nested === "" || (!nested.startsWith("..") && !isAbsolute(nested)); }
