import { describe, expect, it, vi } from "vitest";
import type { AppSettings, QuickOpenShortcutSettings } from "@actspace/shared";
import { QuickOpenShortcutController, type GlobalShortcutRegistrar } from "../quick-open-shortcut-controller";

const automatic: QuickOpenShortcutSettings = {
  enabled: true,
  accelerator: "CommandOrControl+Shift+Space",
  target: { kind: "automatic" },
};

function makeRegistrar(blocked = new Set<string>()) {
  const callbacks = new Map<string, () => void>();
  const registrar: GlobalShortcutRegistrar = {
    register: vi.fn((accelerator, callback) => {
      if (blocked.has(accelerator)) return false;
      callbacks.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator) => {
      callbacks.delete(accelerator);
    }),
  };
  return { registrar, callbacks };
}

describe("QuickOpenShortcutController", () => {
  it("registers the initial shortcut and invokes the trigger", () => {
    const { registrar, callbacks } = makeRegistrar();
    const onTrigger = vi.fn();
    const controller = new QuickOpenShortcutController(registrar, onTrigger, automatic.accelerator);

    expect(controller.activate(automatic)).toEqual({ registered: true, accelerator: automatic.accelerator });
    callbacks.get(automatic.accelerator)?.();
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("registers a replacement before persisting and then unregisters the old binding", async () => {
    const { registrar, callbacks } = makeRegistrar();
    const controller = new QuickOpenShortcutController(registrar, vi.fn(), automatic.accelerator);
    controller.activate(automatic);
    const next = { ...automatic, accelerator: "CommandOrControl+Alt+A" };
    const settings = { shortcuts: { quickOpen: next } } as AppSettings;
    const persist = vi.fn(async () => settings);

    const result = await controller.update(automatic, next, persist);

    expect(result.ok).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(registrar.unregister).toHaveBeenCalledWith(automatic.accelerator);
    expect(callbacks.has(next.accelerator)).toBe(true);
  });

  it("keeps the current binding when the replacement is occupied", async () => {
    const blocked = new Set(["CommandOrControl+Alt+A"]);
    const { registrar, callbacks } = makeRegistrar(blocked);
    const controller = new QuickOpenShortcutController(registrar, vi.fn(), automatic.accelerator);
    controller.activate(automatic);
    const next = { ...automatic, accelerator: "CommandOrControl+Alt+A" };
    const persist = vi.fn(async () => ({ shortcuts: { quickOpen: next } } as AppSettings));

    const result = await controller.update(automatic, next, persist);

    expect(result.ok).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(callbacks.has(automatic.accelerator)).toBe(true);
  });

  it("unregisters the binding after disabling is persisted", async () => {
    const { registrar, callbacks } = makeRegistrar();
    const controller = new QuickOpenShortcutController(registrar, vi.fn(), automatic.accelerator);
    controller.activate(automatic);
    const next = { ...automatic, enabled: false };

    const result = await controller.update(
      automatic,
      next,
      async () => ({ shortcuts: { quickOpen: next } } as AppSettings),
    );

    expect(result.ok).toBe(true);
    expect(callbacks.size).toBe(0);
    expect(controller.getStatus()).toEqual({ registered: false, accelerator: next.accelerator });
  });
});
