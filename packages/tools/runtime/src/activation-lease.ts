import { ToolRuntimeError } from "./errors.js";

export type ToolRegistrationState = "active" | "draining" | "disposed";

export class ToolActivationLease {
  #released = false;

  constructor(
    readonly registrationId: string,
    private readonly releaseLease: () => void,
    private readonly isRegistrationUsable: () => boolean,
  ) {}

  assertUsable(): void {
    if (this.#released || !this.isRegistrationUsable()) {
      throw new ToolRuntimeError({ code: "TOOL_REGISTRATION_DRAINING", message: `Tool registration ${this.registrationId} is unavailable.`, retryable: true, phase: "guard" });
    }
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    this.releaseLease();
  }
}

export class ToolRegistrationLeaseOwner {
  #state: ToolRegistrationState = "active";
  #leases = 0;
  #waiters = new Set<() => void>();

  constructor(readonly registrationId: string) {}

  get state(): ToolRegistrationState { return this.#state; }
  get leaseCount(): number { return this.#leases; }

  acquire(): ToolActivationLease {
    if (this.#state !== "active") {
      throw new ToolRuntimeError({ code: "TOOL_REGISTRATION_DRAINING", message: `Tool registration ${this.registrationId} is ${this.#state}.`, retryable: true, phase: "prepare" });
    }
    this.#leases += 1;
    return new ToolActivationLease(this.registrationId, () => this.#release(), () => this.#state !== "disposed");
  }

  beginDrain(): void {
    if (this.#state === "active") this.#state = "draining";
    if (this.#leases === 0) this.#notify();
  }

  async dispose(timeoutMs = 30_000): Promise<void> {
    if (this.#state === "disposed") return;
    this.beginDrain();
    if (this.#leases > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          new Promise<void>((resolve) => this.#waiters.add(resolve)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ToolRuntimeError({ code: "TOOL_REGISTRATION_DRAINING", message: `Timed out draining ${this.registrationId} with ${this.#leases} lease(s).`, retryable: false, phase: "finalize" })), timeoutMs);
            timer.unref?.();
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
    this.#state = "disposed";
    this.#notify();
  }

  #release(): void {
    if (this.#leases === 0) return;
    this.#leases -= 1;
    if (this.#leases === 0) this.#notify();
  }

  #notify(): void {
    for (const resolve of this.#waiters) resolve();
    this.#waiters.clear();
  }
}
