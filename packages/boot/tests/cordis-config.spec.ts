import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertLoaderTransport, bootDshCordis } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DSH-style cordis.yml boot", () => {
  it("fails closed when the file-backed transport diverges from Composer facts", async () => {
    const root = await fixtureRoot("- id: fixture\n  name: ./plugin.mjs\n  inject: [fixture.host]\n");
    const expected = { entries: [{ id: "fixture", name: "./plugin.mjs", inject: ["fixture.host"] }] } as const;
    await assertLoaderTransport(join(root, "cordis.yml"), expected);
    await expect(assertLoaderTransport(join(root, "cordis.yml"), { entries: [{ id: "fixture", name: "./other.mjs", inject: ["fixture.host"] }] })).rejects.toThrow(/diverges from ResolvedComposition/);
  });

  it("loads a trusted Behavior with a real Context and owns event/effect cleanup", async () => {
    const root = await fixtureRoot();
    const seen: string[] = [];
    const boot = await bootDshCordis({
      configPath: join(root, "cordis.yml"),
      binName: "boot-test",
      prepare: (context) => {
        context.provide?.("fixture.host", Object.freeze({ value: "prepared-before-include" }));
        context.on?.("fixture/ready", (value) => seen.push(String(value)));
      },
    });

    expect(boot.context.get?.("fixture.service")).toMatchObject({ value: "hello", hasContext: true, hostValue: "prepared-before-include" });
    expect(boot.context.get?.("fixture.child")).toEqual("loaded");
    expect(seen).toEqual(["hello"]);
    boot.context.emit?.("fixture/ping", "pong");
    expect(await readFile(join(root, "ping"), "utf8")).toBe("pong");

    expect((await boot.dispose()).disposed).toBe(true);
    expect(await readFile(join(root, "effect-disposed"), "utf8")).toBe("yes");
  });

  it("fails closed for a pending required service and disposes the partial tree", async () => {
    const root = await fixtureRoot("- id: pending\n  name: ./plugin.mjs\n  inject: [missing.service]\n");
    await expect(bootDshCordis({ configPath: join(root, "cordis.yml"), binName: "boot-test" })).rejects.toThrow(/settlement pending/);
    await expect(access(join(root, "behavior-disposed"))).rejects.toThrow();
  });

  it("preserves the activation error and rejects malformed config", async () => {
    const root = await fixtureRoot("- id: broken\n  name: ./plugin.mjs\n  config:\n    fail: true\n");
    await expect(bootDshCordis({ configPath: join(root, "cordis.yml"), binName: "boot-test" })).rejects.toThrow(/fixture activation failed/);

    await writeFile(join(root, "cordis.yml"), "not-an-entry-list: true\n");
    await expect(bootDshCordis({ configPath: join(root, "cordis.yml"), binName: "boot-test" })).rejects.toThrow(/failed to validate config file/);
  });

  it("validates required services after settlement and disposes before publication", async () => {
    const root = await fixtureRoot();
    await expect(bootDshCordis({
      configPath: join(root, "cordis.yml"),
      binName: "boot-test",
      requiredServices: ["fixture.service", "fixture.missing"],
    })).rejects.toThrow(/required Cordis services are missing: fixture\.missing/);
    expect(await readFile(join(root, "effect-disposed"), "utf8")).toBe("yes");
    expect(await readFile(join(root, "behavior-disposed"), "utf8")).toBe("yes");
  });
});

async function fixtureRoot(config = "- id: fixture\n  name: ./plugin.mjs\n  config:\n    value: hello\n") {
  const root = await mkdtemp(join(tmpdir(), "actspace-cordis-config-"));
  roots.push(root);
  await writeFile(join(root, "cordis.yml"), config);
  await writeFile(join(root, "plugin.mjs"), `
import { writeFileSync } from "node:fs";

export async function apply(ctx, config) {
  if (config.fail) throw new Error("fixture activation failed");
  if (typeof ctx.plugin !== "function" || typeof ctx.on !== "function" || typeof ctx.emit !== "function" || typeof ctx.effect !== "function") {
    throw new Error("fixture did not receive a real Cordis Context");
  }
  const marker = config.markerRoot;
  ctx.provide("fixture.service", { value: config.value, hasContext: ctx.root === ctx.root, hostValue: ctx.get("fixture.host")?.value });
  await ctx.plugin({ name: "fixture-child", apply(child) { child.provide("fixture.child", "loaded"); } });
  ctx.on("fixture/ping", (value) => writeFileSync(marker + "/ping", String(value)));
  ctx.effect(() => () => writeFileSync(marker + "/effect-disposed", "yes"), "fixture-effect");
  ctx.emit("fixture/ready", config.value);
  return () => writeFileSync(marker + "/behavior-disposed", "yes");
}
`);
  const escaped = root.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  await writeFile(join(root, "cordis.yml"), config.replace("value: hello", `value: hello\n    markerRoot: "${escaped}"`));
  return root;
}
