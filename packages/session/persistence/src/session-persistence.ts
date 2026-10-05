import { SessionError, createSessionHeader, type CreateSessionHeaderInput, type EventCodecRegistry, type SessionEventEnvelopeV1 } from "@actspace/session-journal";

export type SessionForkArtifactPort = {
  copyForSession(parentSessionId: string, childSessionId: string, artifactId: string): Promise<{ readonly artifactId: string }>;
  deleteForSession(sessionId: string, artifactId: string): Promise<void>;
};
export type SessionPersistenceCreateOptions = {
  readonly seed?: readonly SessionEventEnvelopeV1[];
  readonly now?: () => string;
  readonly onBackgroundFailure?: (error: unknown) => void;
  readonly onEvent?: (event: SessionEventEnvelopeV1) => void | Promise<void>;
  readonly onFlush?: (throughSeq: number) => void | Promise<void>;
};
export type SessionPersistenceOpenOptions = SessionPersistenceCreateOptions;
export function createPersistedSessionHeader(input: CreateSessionHeaderInput, registry: EventCodecRegistry) {
  const header = createSessionHeader(input);
  if (header.createdWith.codecSetDigest !== registry.digest) throw new SessionError("INVALID_HEADER", "Header codecSetDigest does not match the boot registry.");
  return header;
}
