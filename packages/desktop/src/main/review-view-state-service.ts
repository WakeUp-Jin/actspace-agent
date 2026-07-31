import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReviewSelection } from "@actspace/shared";

type ReviewViewStateEntry = {
  viewed: boolean;
  lastAccessedAt: string;
};

type ReviewViewStateFile = {
  version: 1;
  entries: Record<string, ReviewViewStateEntry>;
};

export type ReviewViewStateIdentity = {
  workspaceId: string;
  selection: ReviewSelection;
  path: string;
  fileFingerprint: string;
};

export type ReviewViewStateServiceOptions = {
  filePath: string;
  maxEntries?: number;
  now?: () => Date;
};

export class ReviewViewStateService {
  private readonly maxEntries: number;
  private readonly now: () => Date;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: ReviewViewStateServiceOptions) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 5_000);
    this.now = options.now ?? (() => new Date());
  }

  async isViewed(identity: ReviewViewStateIdentity): Promise<boolean> {
    const state = await this.readState();
    return state.entries[reviewViewStateKey(identity)]?.viewed === true;
  }

  async setViewed(identity: ReviewViewStateIdentity, viewed: boolean): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.readState();
      const key = reviewViewStateKey(identity);
      if (viewed) {
        state.entries[key] = { viewed: true, lastAccessedAt: this.now().toISOString() };
      } else {
        delete state.entries[key];
      }
      this.prune(state);
      await this.writeState(state);
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = this.mutationTail.then(operation, operation);
    this.mutationTail = run.catch(() => undefined);
    return run;
  }

  private async readState(): Promise<ReviewViewStateFile> {
    try {
      const raw = JSON.parse(await readFile(this.options.filePath, "utf8")) as unknown;
      if (!raw || typeof raw !== "object") return emptyState();
      const value = raw as { version?: unknown; entries?: unknown };
      if (value.version !== 1 || !value.entries || typeof value.entries !== "object") return emptyState();
      const entries: Record<string, ReviewViewStateEntry> = {};
      for (const [key, entry] of Object.entries(value.entries as Record<string, unknown>)) {
        if (!entry || typeof entry !== "object") continue;
        const candidate = entry as Partial<ReviewViewStateEntry>;
        if (candidate.viewed !== true || typeof candidate.lastAccessedAt !== "string") continue;
        entries[key] = { viewed: true, lastAccessedAt: candidate.lastAccessedAt };
      }
      return { version: 1, entries };
    } catch {
      return emptyState();
    }
  }

  private prune(state: ReviewViewStateFile): void {
    const entries = Object.entries(state.entries);
    if (entries.length <= this.maxEntries) return;
    entries.sort((left, right) => right[1].lastAccessedAt.localeCompare(left[1].lastAccessedAt));
    state.entries = Object.fromEntries(entries.slice(0, this.maxEntries));
  }

  private async writeState(state: ReviewViewStateFile): Promise<void> {
    await mkdir(dirname(this.options.filePath), { recursive: true });
    const temporaryPath = `${this.options.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.options.filePath);
  }
}

export function reviewViewStateKey(identity: ReviewViewStateIdentity): string {
  return createHash("sha256")
    .update(identity.workspaceId)
    .update("\0")
    .update(reviewSelectionKey(identity.selection))
    .update("\0")
    .update(identity.path)
    .update("\0")
    .update(identity.fileFingerprint)
    .digest("hex");
}

export function reviewSelectionKey(selection: ReviewSelection): string {
  switch (selection.kind) {
    case "lastTurn":
      return `lastTurn:${selection.sessionId}:${selection.turnId ?? "latest"}`;
    case "commit":
      return `commit:${selection.sha}`;
    case "branch":
      return `branch:${selection.branch}`;
    default:
      return selection.kind;
  }
}

function emptyState(): ReviewViewStateFile {
  return { version: 1, entries: {} };
}
