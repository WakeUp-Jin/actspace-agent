import { describe, expect, it } from "vitest";
import { activate, createSessionProjectionService } from "../plugin.js";

describe("session projection plugin", () => {
  it("sorts contributors, rejects duplicate ids and keys, and removes an unmounted contribution", () => {
    const service = createSessionProjectionService();
    const order: string[] = [];
    const define = (id: string, key: string) => ({ id, register: (registry: import("../registry.js").SessionProjectionRegistry) => {
      order.push(id);
      registry.register({ key, stateVersion: 1, init: () => [], apply: state => state, view: state => state });
    } });
    service.registerContributor(define("z", "z"));
    const unmount = service.registerContributor(define("temporary", "temporary"));
    unmount();
    service.registerContributor(define("a", "a"));
    expect(() => service.registerContributor(define("a", "other"))).toThrow(/Duplicate/);
    const registry = service.createRegistry();
    service.applyContributors(registry, text => text);
    expect(order).toEqual(["a", "z"]);
    expect(registry.stateVersions).toEqual({ a: 1, z: 1 });
    const duplicate = createSessionProjectionService();
    duplicate.registerContributor(define("a", "same"));
    duplicate.registerContributor(define("b", "same"));
    expect(() => duplicate.applyContributors(duplicate.createRegistry(), text => text)).toThrow(/Duplicate projection key/);
  });

  it("applies registered contributors before restore and rejects late registration", () => {
    const service = createSessionProjectionService();
    const dispose = service.registerContributor({ id: "todo", register: registry => {
      registry.register({ key: "todos", stateVersion: 1, init: () => [], apply: state => state, view: state => state });
    } });
    const registry = service.createRegistry();
    service.applyContributors(registry, text => text);
    expect(registry.stateVersions.todos).toBe(1);
    expect(() => service.registerContributor({ id: "late", register: () => undefined })).toThrow("before restoring sessions");
    dispose();
  });
  it("publishes deterministic projection service and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["session.projection"]).toBeDefined();
    expect(activation.services?.["session.projection"]?.createRegistry()).toBeDefined();
    await activation.dispose();
  });
});
