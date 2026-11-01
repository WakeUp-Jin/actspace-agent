export type SessionErrorCode =
  | "INVALID_HEADER"
  | "INVALID_EVENT"
  | "UNKNOWN_CODEC"
  | "UNSUPPORTED_EVENT_VERSION"
  | "SESSION_BROWSE_ONLY"
  | "SESSION_CORRUPT"
  | "SESSION_DURABILITY_FAILED"
  | "SESSION_WRITER_LOCKED"
  | "SESSION_LEASE_LOST"
  | "SESSION_CLOSED"
  | "INVALID_FORK_BOUNDARY";

export class SessionError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "SessionError";
  }
}

export class SessionDurabilityFailure extends SessionError {
  constructor(
    readonly barrier: string,
    readonly throughSeq: number,
    cause: unknown,
  ) {
    super(
      "SESSION_DURABILITY_FAILED",
      `Session durability checkpoint ${barrier} failed through seq ${throughSeq}.`,
      cause,
    );
    this.name = "SessionDurabilityFailure";
  }
}
