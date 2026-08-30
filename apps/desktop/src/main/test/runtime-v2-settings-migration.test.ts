import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsService, type SecretCrypto } from "../settings-service";

const roots: string[] = [];
const crypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain, "utf8"),
  decrypt: (cipher) => cipher.toString("utf8"),
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function rootWithSettingsV2(): Promise<{ readonly root: string; readonly rawV2: string }> {
  const root = await mkdtemp(join(tmpdir(), "actspace-settings-v3-"));
  roots.push(root);
  const initial = new SettingsService({ dataRoot: root, crypto });
  await initial.load();
  const parsed = JSON.parse(await readFile(join(root, "settings.json"), "utf8")) as Record<string, unknown>;
  parsed.version = 2;
  const rawV2 = `${JSON.stringify(parsed, null, 2)}\n`;
  await writeFile(join(root, "settings.json"), rawV2, "utf8");
  return { root, rawV2 };
}

describe("SettingsService v3 migration", () => {
  it("backs up a complete v2 file with a digest before atomically publishing v3", async () => {
    const { root, rawV2 } = await rootWithSettingsV2();
    await new SettingsService({ dataRoot: root, crypto }).load();

    expect(await readFile(join(root, "settings.v2.backup.json"), "utf8")).toBe(rawV2);
    expect(await readFile(join(root, "settings.v2.backup.sha256"), "utf8")).toBe(`${createHash("sha256").update(rawV2).digest("hex")}\n`);
    expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toMatchObject({ version: 3 });
  });

  it("rejects a conflicting backup and preserves the original v2 settings", async () => {
    const { root, rawV2 } = await rootWithSettingsV2();
    await writeFile(join(root, "settings.v2.backup.json"), "conflict\n", "utf8");

    await expect(new SettingsService({ dataRoot: root, crypto }).load()).rejects.toThrow("migration failed");
    expect(await readFile(join(root, "settings.json"), "utf8")).toBe(rawV2);
  });

  it("blocks startup on malformed settings without replacing the source file", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-settings-invalid-"));
    roots.push(root);
    const invalid = "{ invalid-json\n";
    await writeFile(join(root, "settings.json"), invalid, "utf8");

    await expect(new SettingsService({ dataRoot: root, crypto }).load()).rejects.toThrow("invalid JSON");
    expect(await readFile(join(root, "settings.json"), "utf8")).toBe(invalid);
  });
});
