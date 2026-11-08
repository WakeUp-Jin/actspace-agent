import type { UsageActivityRow } from "@actspace/shared";

/** One Session's projected request rows, written into the Usage read model. */
export type IndexedUsageSource = {
  readonly sessionId: string;
  readonly title: string | null;
  readonly throughJournalSeq: number;
  readonly rows: readonly UsageActivityRow[];
};
