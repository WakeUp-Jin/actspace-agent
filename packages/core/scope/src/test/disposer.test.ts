import { describe, expect, it } from "vitest";
import { ScopeDisposer } from "../disposer.js";

describe("ScopeDisposer", () => {
  it("shares one quiescence promise across concurrent dispose calls", async () => {
    const disposer = new ScopeDisposer();
    let release!: () => void;
    const settled = new Promise<void>((resolve) => { release = resolve; });
    let runs = 0;
    disposer.add(async () => { runs += 1; await settled; });

    const first = disposer.dispose();
    const second = disposer.dispose();
    let secondSettled = false;
    void second.then(() => { secondSettled = true; });
    await Promise.resolve();
    expect(disposer.state).toBe("quiescing");
    expect(secondSettled).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(disposer.state).toBe("disposed");
    expect(runs).toBe(1);
  });

  it("runs all disposers in reverse order and keeps the first failure", async () => {
    const disposer = new ScopeDisposer();
    const order: string[] = [];
    disposer.add(() => { order.push("first"); });
    disposer.add(() => { order.push("second"); throw new Error("second failure"); });
    disposer.add(() => { order.push("third"); throw new Error("third failure"); });

    await expect(disposer.dispose()).rejects.toThrow("third failure");
    expect(order).toEqual(["third", "second", "first"]);
  });

  it("rejects registrations after quiescence starts", async () => {
    const disposer = new ScopeDisposer();
    const pending = disposer.dispose();
    expect(() => disposer.add(() => undefined)).toThrow("already disposed");
    await pending;
  });

  it("waits for acquired work leases before reporting disposal complete", async () => {
    const disposer = new ScopeDisposer();
    let release!: () => void;
    const lease = disposer.acquire();
    const pending = disposer.dispose();
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release = lease;
    release();
    await pending;
    expect(settled).toBe(true);
  });
});
