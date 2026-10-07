import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pluginDevelopmentRoot } from "../index.js";
it("ships the developer guide, contract and executable source template", async () => {
  expect(await readFile(join(pluginDevelopmentRoot, "SKILL.md"), "utf8")).toContain("plugin_manager");
  expect(await readFile(join(pluginDevelopmentRoot, "references/contract.md"), "utf8")).toContain("implementation.ts");
  expect(await readFile(join(pluginDevelopmentRoot, "templates/implementation.ts"), "utf8")).toContain("export async function execute");
});
