export class RuntimeProfileConflictError extends Error { constructor() { super("A ready runtime profile already exists in this process."); this.name = "RuntimeProfileConflictError"; } }
export class RuntimeShutdownFailure extends Error { constructor(readonly blockers: readonly string[]) { super(`Runtime shutdown left blockers: ${blockers.join(", ")}`); this.name = "RuntimeShutdownFailure"; } }
