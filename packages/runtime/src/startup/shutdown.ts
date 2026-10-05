export type ShutdownDeadlineResult<T> =
  | { readonly kind: "completed"; readonly value: T }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "timeout"; readonly timeoutMs: number };

export async function settleWithinDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<ShutdownDeadlineResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = Symbol("shutdown-timeout");
  try {
    const result = await Promise.race([
      operation.then((value) => ({ kind: "completed" as const, value }), (error: unknown) => ({ kind: "failed" as const, error })),
      new Promise<typeof timeout>((resolveTimeout) => { timer = setTimeout(() => resolveTimeout(timeout), timeoutMs); timer.unref?.(); }),
    ]);
    return result === timeout ? { kind: "timeout", timeoutMs } : result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
