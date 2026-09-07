import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SettingsService } from "../settings-service";
import { DEFAULT_SPEECH_SETTINGS, SPEECH_MODELS } from "@actspace/shared";

describe("English learning settings", () => {
  it("adds defaults to old v4, persists preferences, and keeps speech credentials out of snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "english-learning-settings-"));
    const create = () => new SettingsService({ dataRoot: root, crypto: { isAvailable: () => true, encrypt: (value) => Buffer.from(value), decrypt: (value) => value.toString() } });
    try {
      const initial = create(); await initial.load();
      const raw = initial.getV4().settings;
      delete raw.media.speech; delete raw.general.englishLearning;
      await writeFile(join(root, "settings.json"), JSON.stringify(raw));
      const service = create(); await service.load();
      expect(service.getSpeechSettings()).toEqual(DEFAULT_SPEECH_SETTINGS);
      for (const model of SPEECH_MODELS) {
        await service.updateNamespaceV4({ expectedRevision: service.getV4().revision, namespace: "media", patch: { speech: { ...DEFAULT_SPEECH_SETTINGS, model } } });
        const restored = create(); await restored.load();
        expect(restored.getSpeechSettings().model).toBe(model);
      }
      // Unknown or missing persisted values must retain the legacy default.
      for (const model of ["unsupported-model", undefined]) {
        const raw = service.getV4().settings;
        await writeFile(join(root, "settings.json"), JSON.stringify({ ...raw, media: { ...raw.media, speech: { ...DEFAULT_SPEECH_SETTINGS, model } } }));
        const restored = create(); await restored.load();
        expect(restored.getSpeechSettings().model).toBe(DEFAULT_SPEECH_SETTINGS.model);
      }
      const notified = vi.fn(); service.subscribeV4Changes(notified);
      await service.updateNamespaceV4({ expectedRevision: service.getV4().revision, namespace: "media", patch: { speech: { ...DEFAULT_SPEECH_SETTINGS, model: "speech-2.8-hd", speed: 1.2, voiceId: "voice-test" } } });
      await service.updateNamespaceV4({ expectedRevision: service.getV4().revision, namespace: "general", patch: { englishLearning: { lastSessionId: "a" } } });
      expect(await service.setProviderKey("speech-minimax", "secret-canary")).toEqual({ ok: true });
      expect(service.getStoredKey("speech-minimax")).toBe("secret-canary");
      expect(JSON.stringify(service.getV4())).not.toContain("secret-canary");
      expect(await readFile(join(root, "settings.json"), "utf8")).not.toContain("secret-canary");
      const reloaded = create(); await reloaded.load();
      expect(reloaded.getSpeechSettings()).toMatchObject({ model: "speech-2.8-hd", speed: 1.2, voiceId: "voice-test" });
      expect(reloaded.getV4().settings.general.englishLearning?.lastSessionId).toBe("a");
      expect(reloaded.getStoredKey("speech-minimax")).toBe("secret-canary");
      expect(await reloaded.clearProviderKey("speech-minimax")).toEqual({ ok: true });
      expect(reloaded.getStoredKey("speech-minimax")).toBeUndefined();
      expect(notified).toHaveBeenCalledWith(expect.objectContaining({ changedNamespaces: ["media"] }));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
