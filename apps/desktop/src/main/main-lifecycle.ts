type LifecycleWindow = { on(event: "closed", listener: () => void): unknown; readonly webContents: { readonly id: number } };
type Log = (message: string, details?: Record<string, unknown>) => void;

export type WindowLifecycleDeps = {
  readonly onClosed: () => void;
  readonly closeOwnedTerminals: (ownerId: number) => Promise<void>;
  readonly log: Log;
};

/** webContents is already destroyed when "closed" fires, so the terminal owner id is captured up front. */
export function attachWindowLifecycle(win: LifecycleWindow, deps: WindowLifecycleDeps): void {
  const ownerId = win.webContents.id;
  win.on("closed", () => {
    deps.onClosed();
    void deps.closeOwnedTerminals(ownerId).catch((error: unknown) => {
      deps.log("window terminal cleanup failed", { ownerId, error: error instanceof Error ? error.message : String(error) });
    });
  });
}

type ProcessLike = Pick<NodeJS.EventEmitter, "on" | "off">;

/**
 * Log uncaught exceptions and unhandled rejections from the main process.
 * Exceptions use the monitor event so Electron's default handling stays as is.
 */
export function installProcessErrorLogging(log: Log, target: ProcessLike = process): () => void {
  const onException = (error: unknown, origin: unknown) => {
    log("main process uncaught exception", { origin: String(origin), ...describeError(error) });
  };
  const onRejection = (reason: unknown) => {
    log("main process unhandled rejection", describeError(reason));
  };
  target.on("uncaughtExceptionMonitor", onException);
  target.on("unhandledRejection", onRejection);
  return () => {
    target.off("uncaughtExceptionMonitor", onException);
    target.off("unhandledRejection", onRejection);
  };
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { error: error.message, stack: error.stack };
  return { error: String(error) };
}
