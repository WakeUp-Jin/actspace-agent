import type { RuntimeV2JsonValue } from "./host-dto";
export type SessionEventCriticality = "required" | "ignorable";

export type SessionEventSourceV1 = {
  readonly ownerPluginId: string;
  readonly agentId?: string;
  readonly turnId?: string;
  readonly stepId?: string;
};

export type SessionEventProvenanceV1 = {
  readonly sourceEventSeqs: readonly number[];
  readonly contributorIds: readonly string[];
  readonly runtimeSelectionSeq: number | null;
};

export type SessionSurfaceNodeV1 =
  | {
      readonly kind: "user";
      readonly messageId: string;
      readonly content: RuntimeV2JsonValue;
      readonly attachmentRefs?: readonly RuntimeV2JsonValue[];
    }
  | {
      readonly kind: "assistant";
      readonly messageId: string;
      readonly content: RuntimeV2JsonValue;
    }
  | {
      readonly kind: "tool-result";
      readonly messageId: string;
      readonly callId: string;
      readonly content: RuntimeV2JsonValue;
      readonly isError: boolean;
    };

export type SessionSurfaceOperationV1 =
  | { readonly kind: "append"; readonly node: SessionSurfaceNodeV1 }
  | {
      readonly kind: "replace";
      readonly start: number;
      readonly end: number;
      readonly node: SessionSurfaceNodeV1;
      readonly sourceEventSeqs: readonly number[];
    };

export type SessionEventEnvelopeV1 = {
  readonly recordKind: "event";
  readonly seq: number;
  readonly type: string;
  readonly eventVersion: number;
  readonly criticality: SessionEventCriticality;
  readonly time: string;
  readonly source: SessionEventSourceV1;
  readonly data: RuntimeV2JsonValue;
  readonly surface: SessionSurfaceOperationV1 | null;
  readonly provenance: SessionEventProvenanceV1;
};

export type SessionEventCandidateV1 = Omit<
  SessionEventEnvelopeV1,
  "recordKind" | "seq" | "time" | "criticality" | "provenance"
> & { readonly provenance?: SessionEventProvenanceV1 };
