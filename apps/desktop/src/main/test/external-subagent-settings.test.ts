// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { SettingsService } from "../settings-service";
import { resolvePluginSettings } from "../plugins/plugin-switches";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const crypto = { isAvailable: () => true, encrypt: (plain: string) => Buffer.from(plain), decrypt: (cipher: Buffer) => cipher.toString() };

it("persists external subagent plugin settings through tools updates, merging per plugin", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-ext-subagent-")); roots.push(root);
  const settings = new SettingsService({ dataRoot: root, crypto }); await settings.load();
  expect(settings.getV4().settings.tools.externalSubagents).toBeUndefined();
  const update = (patch: Partial<import("@actspace/shared").SettingsV4Tools>) => settings.updateNamespaceV4({ namespace: "tools", expectedRevision: settings.getV4().revision, patch });
  await update({ externalSubagents: { codex: { sandbox: "read-only" } } });
  await update({ externalSubagents: { codex: { approvalPolicy: "untrusted" }, claudeCode: { permissionMode: "plan" } } });
  const reloaded = new SettingsService({ dataRoot: root, crypto }); await reloaded.load();
  expect(reloaded.getV4().settings.tools.externalSubagents).toEqual({ codex: { sandbox: "read-only", approvalPolicy: "untrusted" }, claudeCode: { permissionMode: "plan" } });
  expect(resolvePluginSettings(reloaded.getV4().settings)).toEqual({
    "subagent-codex": { approvalPolicy: "untrusted", sandbox: "read-only" },
    "subagent-claude-code": { permissionMode: "plan" },
  });
  // An unknown stored value falls back to the default on the next update's sanitize.
  await update({ externalSubagents: { codex: { sandbox: "bogus" as never } } });
  expect(resolvePluginSettings(settings.getV4().settings)["subagent-codex"]).toEqual({ approvalPolicy: "untrusted", sandbox: "workspace-write" });
});
