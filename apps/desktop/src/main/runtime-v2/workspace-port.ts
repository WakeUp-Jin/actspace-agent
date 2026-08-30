import { isAbsolute, relative, resolve } from "node:path";

export type DesktopWorkspaceFacts = {
  readonly workspaceRoot: string;
  readonly workspaceId: string | null;
  readonly worktree: boolean;
};

export class DesktopWorkspacePort {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  facts(): DesktopWorkspaceFacts {
    return Object.freeze({ workspaceRoot: this.root, workspaceId: null, worktree: false });
  }

  resolveInside(path: string): string {
    const target = resolve(this.root, path);
    const fromRoot = relative(this.root, target);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      throw new Error("Path escapes the active Desktop workspace.");
    }
    return target;
  }
}
