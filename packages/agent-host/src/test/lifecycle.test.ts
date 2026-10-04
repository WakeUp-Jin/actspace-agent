import { expect, it } from "vitest";
import { manifest } from "../manifest.js";
import { apply } from "../plugin.js";
it("declares Host application and stays dormant in embedded profiles", () => {
  expect(manifest.behaviors[0]?.entryId).toBe("host.application");
  const provided: string[] = [];
  apply({ get: () => undefined, provide: name => { provided.push(name); } });
  expect(provided).toEqual([]);
});
