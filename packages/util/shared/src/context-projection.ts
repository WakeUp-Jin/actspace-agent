import type { RuntimeJsonValue } from "./runtime-v2";

/** JSON-safe read-only view published by the Context Engine to Host/IPC. */
export type ManagedContextProjection = {
  readonly schemaVersion: 1;
  readonly identity: { readonly sessionId: string; readonly logicalAgentScopeId: string };
  readonly basis: "current-context" | "request";
  readonly contextRevision: number;
  readonly throughJournalSeq: number;
  readonly surfaceGeneration: number;
  readonly instanceGeneration?: string;
  readonly model?: import("./context-panel").ContextPanelModel | null;
  readonly manifest?: import("./context-panel").ContextContentManifest;
  readonly request?: { readonly requestId: string; readonly turnId?: string; readonly stepId?: string; readonly routeId: string; readonly model: string };
  readonly content: {
    readonly system: { readonly sections: readonly { readonly id: string; readonly owner: string; readonly order: number; readonly content: RuntimeJsonValue }[]; readonly modelFacts: readonly RuntimeJsonValue[] };
    readonly conversation: { readonly replaceGeneration: number; readonly entries: readonly { readonly node: RuntimeJsonValue; readonly sourceEventSeqs: readonly number[] }[] };
    readonly supplements: readonly { readonly id: string; readonly owner: string; readonly sourceEventSeq: number; readonly afterEventSeq: number; readonly text: string }[];
    readonly tools: readonly RuntimeJsonValue[];
  };
  readonly status: { readonly throughJournalSeq: number; readonly cycle: number; readonly paths: readonly RuntimeJsonValue[]; readonly sleepingDirectory?: RuntimeJsonValue; readonly facts: readonly RuntimeJsonValue[]; readonly plugins: Readonly<Record<string, RuntimeJsonValue>> };
};
