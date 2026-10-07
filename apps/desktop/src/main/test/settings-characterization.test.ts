// @vitest-environment node
/**
 * 特征测试（17 T1）：在拆分 settings-service 之前，把现有行为原样记下来。
 * 这里只断言「现在是什么样」，不评价对不对；看起来不合理的行为在注释里标出，并记在 17 的执行记录。
 *
 * 快照存成 `fixtures/settings/expected/*.json`（不用 vitest 的 toMatchSnapshot：本机 `src/main` 的 realpath
 * 和测试路径不一致时 snapshot 状态找不到）。现有行为有意改变时，用 `UPDATE_SETTINGS_GOLDEN=1` 重新生成，并在提交里说明。
 */
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderSettingsError, SettingsRevisionConflictError, SettingsService, type SecretCrypto, type SettingsServiceOptions } from "../settings-service";

const FIXTURES = join(__dirname, "fixtures", "settings");
const UPDATE_GOLDEN = process.env.UPDATE_SETTINGS_GOLDEN === "1";
const ENV_KEYS = [
  "DEEPSEEK_API_KEY",
  "KIMI_API_KEY",
  "ZHIPU_API_KEY",
  "TAVILY_API_KEY",
  "TINYFISH_API_KEY",
  "EXA_API_KEY",
  "IMAGE_GENERATION_BASE_URL",
  "IMAGE_GENERATION_MODEL",
  "ACTSPACE_DISABLED_TOOLS",
  "ACTSPACE_BASH_ALWAYS_ASK",
  "LLM_TEMPERATURE",
  "LLM_MAX_TOKENS",
] as const;

type JsonWriter = NonNullable<SettingsServiceOptions["writeJson"]>;

const fixtureCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, "utf8"),
  decrypt: (cipher) => {
    const text = cipher.toString("utf8");
    if (!text.startsWith("enc:")) throw new Error("not encrypted by the fixture crypto");
    return text.slice("enc:".length);
  },
};

const roots: string[] = [];
let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    if (process.env[key] !== undefined) savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot(files: Partial<Record<"settings.json" | "secrets.json", string>> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-settings-char-"));
  roots.push(root);
  for (const [target, fixture] of Object.entries(files)) {
    await copyFile(join(FIXTURES, fixture), join(root, target));
  }
  return root;
}

function envSnapshot(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

async function expectGolden(name: string, actual: unknown): Promise<void> {
  const file = join(FIXTURES, "expected", `${name}.json`);
  const json = `${JSON.stringify(actual, null, 2)}\n`;
  if (UPDATE_GOLDEN) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, json, "utf8");
    return;
  }
  expect(JSON.parse(json)).toEqual(JSON.parse(await readFile(file, "utf8")));
}

/** 数据目录下所有文件的内容（按相对路径排序），临时目录换成 `<root>`，secrets 文件附上权限位。 */
async function readTree(root: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  async function walk(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const raw = (await readFile(full, "utf8")).split(root).join("<root>");
      const name = relative(root, full);
      out[name] = name.endsWith(".json") ? JSON.parse(raw) : raw;
      if (name === "secrets.json") out["secrets.json mode"] = ((await stat(full)).mode & 0o777).toString(8);
    }
  }
  await walk(root);
  return out;
}

function normalized(value: unknown, root: string): unknown {
  return JSON.parse(JSON.stringify(value ?? null).split(root).join("<root>"));
}

/** 和默认 writeJsonAtomic 写出同样的字节；可以让第 N 次调用在写入前或写入后抛错，也可以让第 N 次调用等一个 gate。 */
function recordingWriter() {
  const calls: Array<{ file: string; value: unknown }> = [];
  const failures = new Map<number, "before" | "after">();
  const gates = new Map<number, Promise<void>>();
  const writeJson: JsonWriter = async (filePath, value, options) => {
    calls.push({ file: basename(filePath), value: JSON.parse(JSON.stringify(value)) });
    const call = calls.length;
    await gates.get(call);
    if (failures.get(call) === "before") throw new Error(`injected failure before write #${call}`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(options?.mode !== undefined && { mode: options.mode }) });
    if (options?.mode !== undefined) await chmod(filePath, options.mode);
    if (failures.get(call) === "after") throw new Error(`injected failure after write #${call}`);
  };
  return {
    writeJson,
    calls,
    files: () => calls.map((call) => call.file),
    /** 从现在开始重新计数。 */
    reset(): void {
      calls.length = 0;
      failures.clear();
      gates.clear();
    },
    failOn(call: number, when: "before" | "after"): void {
      failures.set(call, when);
    },
    gateOn(call: number): () => void {
      let release!: () => void;
      gates.set(call, new Promise<void>((resolve) => { release = resolve; }));
      return release;
    },
  };
}

function sequentialIds(): () => string {
  let next = 0;
  return () => `cred${++next}`;
}

describe("settings load snapshots (v1–v4)", () => {
  it.each(["v1", "v2", "v3", "v4"])("loads a %s settings file", async (version) => {
    const root = await makeRoot({ "settings.json": `${version}.json` });
    const fixtureRaw = await readFile(join(FIXTURES, `${version}.json`), "utf8");
    const reloadEnv = vi.fn();
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, reloadEnv });
    await service.load();

    const v4 = service.getV4();
    // revision 是整份 v4 的哈希，含临时目录下的绝对 systemPromptPath，每次运行都不同，所以不进快照。
    expect(v4.revision).toMatch(/^[0-9a-f]{64}$/);
    await expectGolden(`load-${version}`, {
      views: normalized({
        get: service.get(),
        v4: { ...v4, revision: "<revision>" },
        lastLoadError: service.getLastLoadError() ?? null,
        credentialStorage: service.getCredentialStorageView(),
      }, root),
      files: await readTree(root),
    });
    expect(reloadEnv).toHaveBeenCalledTimes(1);

    if (version === "v1") expect(await readFile(join(root, "settings.v1.backup.json"), "utf8")).toBe(fixtureRaw);
    // v4 原样读取：load 不重写 settings.json，也不生成备份。
    if (version === "v4") expect(await readFile(join(root, "settings.json"), "utf8")).toBe(fixtureRaw);
  });

  it("starts from env defaults when settings.json is missing", async () => {
    process.env.LLM_TEMPERATURE = "0.9";
    process.env.LLM_MAX_TOKENS = "1000";
    process.env.ACTSPACE_DISABLED_TOOLS = " bash , ,web_fetch";
    process.env.ACTSPACE_BASH_ALWAYS_ASK = "1";
    process.env.IMAGE_GENERATION_BASE_URL = "https://images.env.example/v1/";
    process.env.IMAGE_GENERATION_MODEL = "env-image-model";
    const root = await makeRoot();
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto });
    await service.load();

    expect(normalized({ agent: service.get().agent, imageGeneration: service.get().imageGeneration }, root)).toEqual({
      agent: {
        systemPromptPath: "<root>/prompts/main-agent.md",
        temperature: 0.9,
        maxTokens: 1000,
        disabledTools: ["bash", "web_fetch"],
        bashAlwaysAsk: true,
        exploreModelId: null,
      },
      imageGeneration: { hasApiKey: false, baseUrl: "https://images.env.example/v1", model: "env-image-model" },
    });
    await expectGolden("load-missing", {
      files: await readTree(root),
      env: Object.fromEntries(Object.entries(envSnapshot()).map(([key, value]) => [key, value ?? null])),
    });
  });

  it("migrates v1 settings together with legacy v1 secrets", async () => {
    const root = await makeRoot({ "settings.json": "v1.json", "secrets.json": "secrets-v1-legacy.json" });
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto });
    await service.load();

    // v1 迁移按「有没有 DeepSeek key」决定 utility 模型；secrets 先于 settings 读取，所以解密出的 key 会参与判断。
    expect(service.get().taskModels).toEqual({
      defaultChatModel: "kimi:kimi-k2.6",
      utilityModel: "deepseek:deepseek-flash",
      exploreModel: "deepseek:deepseek-flash",
    });
    await expectGolden("load-v1-with-legacy-secrets", { files: await readTree(root) });
  });

  it("keeps legacy agent fields in memory but not in the v4 file when the v4 field is already set", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto });
    await service.load();

    // 现有行为：toSettingsV4 只在 v4 的 taskDefaults.temperature 为空时才用 agent.temperature。
    // v4 样本里是 1.2，所以 update 改到 0.1 后内存是 0.1、文件仍是 1.2，重新 load 回到 1.2。
    await expect(service.update({ agent: { temperature: 0.1 } })).resolves.toMatchObject({ agent: { temperature: 0.1 } });
    await expect(service.updateV2({ agent: { maxTokens: 999 } })).resolves.toMatchObject({ agent: { temperature: 0.1, maxTokens: 999 } });
    const written = JSON.parse(await readFile(join(root, "settings.json"), "utf8"));
    expect(written.general.taskDefaults).toMatchObject({ temperature: 1.2, maxOutputTokens: 2048 });
    expect(process.env.LLM_TEMPERATURE).toBe("0.1");

    const reloaded = new SettingsService({ dataRoot: root, crypto: fixtureCrypto });
    await reloaded.load();
    expect(reloaded.get().agent).toMatchObject({ temperature: 1.2, maxTokens: 2048 });
  });
});

describe("legacy v1 secrets", () => {
  it("decrypts with the injected crypto and rewrites secrets.json as plaintext v2 with mode 600", async () => {
    const root = await makeRoot({ "secrets.json": "secrets-v1-legacy.json" });
    const decrypt = vi.fn(fixtureCrypto.decrypt);
    const service = new SettingsService({ dataRoot: root, crypto: { ...fixtureCrypto, decrypt } });
    await service.load();

    expect(decrypt).toHaveBeenCalledTimes(3);
    expect(service.getStoredKey("deepseek")).toBe("legacy-deepseek-key");
    expect(service.getStoredKey("tavily")).toBe("legacy-tavily-key");
    expect(service.getCredentialStorageView()).toEqual({ status: "ready" });
    expect(service.get().searchProviders.tavily).toEqual({ hasApiKey: true });
    // kimi:extra1 的密钥被保留，但 settings 里没有对应的额外 key 条目（v1 settings 不存在时用默认值）。
    expect(service.get().providers.kimi.additionalCredentials).toEqual([]);
    const tree = await readTree(root);
    expect(tree["secrets.json"]).toEqual({
      version: 2,
      providerCredentials: { "kimi:extra1": "legacy-kimi-extra-key" },
      deepseek: "legacy-deepseek-key",
      tavily: "legacy-tavily-key",
    });
    expect(tree["secrets.json mode"]).toBe("600");
    expect(process.env.TAVILY_API_KEY).toBe("legacy-tavily-key");
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it.each([
    ["crypto is unavailable", { ...fixtureCrypto, isAvailable: () => false }],
    ["decryption throws", { ...fixtureCrypto, decrypt: () => { throw new Error("keychain locked"); } }],
    ["decryption returns an empty string", { ...fixtureCrypto, decrypt: () => "" }],
  ])("keeps the legacy file untouched and blocks credential edits when %s", async (_label, crypto: SecretCrypto) => {
    const root = await makeRoot({ "secrets.json": "secrets-v1-legacy.json" });
    const raw = await readFile(join(root, "secrets.json"), "utf8");
    const service = new SettingsService({ dataRoot: root, crypto });
    await service.load();

    expect(await readFile(join(root, "secrets.json"), "utf8")).toBe(raw);
    expect(service.getStoredKey("deepseek")).toBeUndefined();
    expect(service.getCredentialStorageView()).toEqual({
      status: "unavailable",
      code: "migration_failed",
      message: "旧版凭据无法解密。请使用最后一次能读取这些 Key 的 Actspace 版本启动后再迁移。",
    });
    expect(await service.setProviderKey("tavily", "new-tavily-key")).toEqual({
      ok: false,
      error: "旧版凭据无法解密。请使用最后一次能读取这些 Key 的 Actspace 版本启动后再迁移。",
    });
    expect(await readFile(join(root, "secrets.json"), "utf8")).toBe(raw);
  });
});

type RollbackCase = {
  readonly name: string;
  readonly seed?: (service: SettingsService) => Promise<unknown>;
  readonly run: (service: SettingsService) => Promise<unknown>;
  readonly message: string;
};

const ROLLBACK_CASES: RollbackCase[] = [
  {
    name: "updateProviderConnection",
    seed: (service) => service.updateProviderConnection({ provider: "deepseek", apiKey: "old-deepseek-key" }),
    run: (service) => service.updateProviderConnection({ provider: "deepseek", apiKey: "new-deepseek-key", baseUrl: "https://gateway.example/v1" }),
    message: "供应商设置写入失败。",
  },
  {
    name: "removeProvider",
    seed: (service) => service.updateProviderConnection({ provider: "kimi", apiKey: "old-kimi-key", enabled: false }),
    run: (service) => service.removeProvider("kimi"),
    message: "服务商移除失败。",
  },
  {
    name: "updateImageGeneration",
    seed: (service) => service.updateImageGeneration({ apiKey: "old-image-key", baseUrl: "https://images.example/v1", model: "old-model" }),
    run: (service) => service.updateImageGeneration({ apiKey: "new-image-key", baseUrl: "https://images.example/v2", model: "new-model" }),
    message: "图片生成配置写入失败。",
  },
  {
    name: "addProviderCredential",
    run: (service) => service.addProviderCredential({ provider: "kimi", label: "Second key", apiKey: "kimi-extra-key", pricingMultiplier: 2 }),
    message: "额外 API Key 写入失败。",
  },
  {
    name: "removeProviderCredential",
    seed: (service) => service.addProviderCredential({ provider: "kimi", label: "Team key", apiKey: "kimi-extra-key" }),
    run: (service) => service.removeProviderCredential("kimi", "cred1"),
    message: "额外 API Key 删除失败。",
  },
];

describe("rollback when settings.json fails after secrets.json was written", () => {
  async function seeded(testCase: RollbackCase) {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const writer = recordingWriter();
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, writeJson: writer.writeJson, createCredentialId: sequentialIds() });
    await service.load();
    // 先让两份文件都按当前格式写一遍，后面才能逐字节比较「恢复前后」。
    await service.setProviderKey("tavily", "seed-tavily-key");
    await service.updateQuickOpenShortcut({ enabled: true });
    await testCase.seed?.(service);
    const before = {
      files: await readTree(root),
      view: service.get(),
      v4: service.getV4(),
    };
    writer.reset();
    return { root, writer, service, before };
  }

  it.each(ROLLBACK_CASES)("$name restores both files and the in-memory state", async (testCase) => {
    const { root, writer, service, before } = await seeded(testCase);
    // 第 2 次写（settings.json）把字节写下去之后再报错，这样两份文件的恢复都能被观察到。
    writer.failOn(2, "after");

    const error = await testCase.run(service).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderSettingsError);
    expect(error).toMatchObject({ message: testCase.message, code: "write_failed" });
    // 先写 secrets，再写 settings（失败）；恢复时先 settings、后 secrets。
    expect(writer.files()).toEqual(["secrets.json", "settings.json", "settings.json", "secrets.json"]);
    expect(await readTree(root)).toEqual(before.files);
    expect(service.get()).toEqual(before.view);
    expect(service.getV4()).toEqual(before.v4);
  });

  it.each(ROLLBACK_CASES)("$name does not restore files when secrets.json itself fails", async (testCase) => {
    const { root, writer, service, before } = await seeded(testCase);
    writer.failOn(1, "before");

    await expect(testCase.run(service)).rejects.toMatchObject({ message: testCase.message, code: "write_failed" });
    expect(writer.files()).toEqual(["secrets.json"]);
    expect(await readTree(root)).toEqual(before.files);
    expect(service.get()).toEqual(before.view);
  });

  it("restores from memory rather than the original bytes", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const writer = recordingWriter();
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, writeJson: writer.writeJson, createCredentialId: sequentialIds() });
    await service.load();
    const before = await readTree(root);
    expect(before["secrets.json"]).toBeUndefined();
    writer.reset();
    writer.failOn(2, "after");

    await expect(service.addProviderCredential({ provider: "kimi", label: "First", apiKey: "kimi-extra-key" })).rejects.toMatchObject({ code: "write_failed" });
    const after = await readTree(root);
    // 现有行为：原来没有 secrets.json，恢复后多出一份空的；settings.json 按内存重新序列化，
    // 样本里的相对 systemPromptPath 变成了绝对路径。
    expect(after["secrets.json"]).toEqual({ version: 2, providerCredentials: {} });
    expect(after["secrets.json mode"]).toBe("600");
    expect(after["settings.json"]).toEqual(normalized(service.getV4().settings, root));
    expect((before["settings.json"] as { general: { agentInstructions: unknown } }).general.agentInstructions).toEqual({ systemPromptPath: "v4-agent.md" });
    expect((after["settings.json"] as { general: { agentInstructions: unknown } }).general.agentInstructions).toEqual({ systemPromptPath: "<root>/prompts/v4-agent.md" });
  });

  it("stops restoring secrets.json when restoring settings.json also fails (best effort)", async () => {
    const testCase = ROLLBACK_CASES[0]!;
    const { root, writer, service, before } = await seeded(testCase);
    writer.failOn(2, "after");
    writer.failOn(3, "after");

    await expect(testCase.run(service)).rejects.toMatchObject({ code: "write_failed" });
    expect(writer.files()).toEqual(["secrets.json", "settings.json", "settings.json"]);
    const after = await readTree(root);
    expect(after["settings.json"]).toEqual(before.files["settings.json"]);
    // 现有行为：恢复在第一处失败就停，secrets.json 留着新 key；内存里仍是旧 key。
    expect(after["secrets.json"]).toMatchObject({ deepseek: "new-deepseek-key" });
    expect(service.getStoredKey("deepseek")).toBe("old-deepseek-key");
  });
});

describe("mutation queue", () => {
  async function loadedWithWriter() {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const writer = recordingWriter();
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, writeJson: writer.writeJson, createCredentialId: sequentialIds() });
    await service.load();
    writer.reset();
    return { root, writer, service };
  }

  it("runs concurrent updates one at a time in call order", async () => {
    const { writer, service } = await loadedWithWriter();
    const release = writer.gateOn(1);

    const first = service.update({ skills: { disabled: ["first"] } });
    const second = service.update({ skills: { disabled: ["second"] } });
    await vi.waitFor(() => expect(writer.calls).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // 第一个还卡在写文件，第二个没有开始。
    expect(writer.calls).toHaveLength(1);
    release();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.skills.disabled).toEqual(["first"]);
    expect(secondResult.skills.disabled).toEqual(["second"]);
    expect(writer.calls.map((call) => (call.value as { skills: { disabled: string[] } }).skills.disabled)).toEqual([["first"], ["second"]]);
    expect(service.get().skills.disabled).toEqual(["second"]);
  });

  it("keeps the queue going after a failed mutation", async () => {
    const { writer, service } = await loadedWithWriter();
    writer.failOn(1, "before");

    const first = service.update({ skills: { disabled: ["lost"] } });
    const second = service.update({ imageInspection: { modelKey: "openrouter:openai/gpt-5.6-luna" } });
    await expect(first).rejects.toThrow("injected failure before write #1");
    await expect(second).resolves.toMatchObject({ skills: { disabled: ["pptx"] } });
    expect(service.get().skills.disabled).toEqual(["pptx"]);
    expect(writer.files()).toEqual(["settings.json", "settings.json"]);
  });

  it("shares one queue across settings and secrets mutations", async () => {
    const { writer, service } = await loadedWithWriter();
    const release = writer.gateOn(1);

    const pending = [
      service.updateProviderConnection({ provider: "deepseek", apiKey: "queued-deepseek-key" }),
      service.setProviderKey("tavily", "queued-tavily-key"),
      service.update({ skills: { disabled: ["queued-skill"] } }),
      service.addProviderCredential({ provider: "kimi", label: "Queued", apiKey: "queued-kimi-key" }),
    ];
    await vi.waitFor(() => expect(writer.calls).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writer.calls).toHaveLength(1);
    release();
    await Promise.all(pending);

    expect(writer.files()).toEqual([
      "secrets.json", "settings.json",
      "secrets.json",
      "settings.json",
      "secrets.json", "settings.json",
    ]);
  });
});

describe("applyToEnv", () => {
  it("writes the target env keys on load and removes the LLM keys", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    await writeFile(join(root, "secrets.json"), JSON.stringify({
      version: 2,
      providerCredentials: {},
      deepseek: "stored-deepseek-key",
      zhipu: "stored-zhipu-key",
      tavily: "stored-tavily-key",
    }), "utf8");
    process.env.DEEPSEEK_API_KEY = "stale-deepseek";
    process.env.KIMI_API_KEY = "stale-kimi";
    process.env.EXA_API_KEY = "stale-exa";
    const reloadEnv = vi.fn(() => {
      // reloadEnv 在所有键写完之后调用。
      expect(process.env.TAVILY_API_KEY).toBe("stored-tavily-key");
    });
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, reloadEnv });
    await service.load();

    expect(reloadEnv).toHaveBeenCalledTimes(1);
    expect(envSnapshot()).toEqual({
      DEEPSEEK_API_KEY: undefined,
      KIMI_API_KEY: undefined,
      ZHIPU_API_KEY: "stored-zhipu-key",
      TAVILY_API_KEY: "stored-tavily-key",
      TINYFISH_API_KEY: undefined,
      EXA_API_KEY: undefined,
      IMAGE_GENERATION_BASE_URL: "https://images.example/v4",
      IMAGE_GENERATION_MODEL: "image-model-v4",
      ACTSPACE_DISABLED_TOOLS: "web_fetch",
      ACTSPACE_BASH_ALWAYS_ASK: "0",
      LLM_TEMPERATURE: "1.2",
      LLM_MAX_TOKENS: "2048",
    });
  });

  it("calls reloadEnv once for each env-affecting mutation and never for the others", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const reloadEnv = vi.fn();
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, reloadEnv, createCredentialId: sequentialIds() });
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["load", () => service.load()],
      ["update", () => service.update({ skills: { disabled: ["a"] } })],
      ["updateV2", () => service.updateV2({ agent: { temperature: null, maxTokens: null } })],
      ["updateQuickOpenShortcut", () => service.updateQuickOpenShortcut({ enabled: false })],
      ["updateNamespaceV4", () => service.updateNamespaceV4({ namespace: "skills", expectedRevision: service.getV4().revision, patch: { disabled: ["c"] } })],
      ["updateModelStorage", () => service.updateModelStorage({ installedModels: { "kimi:kimi-k2.6": null } })],
      ["updateProviderConnection", () => service.updateProviderConnection({ provider: "kimi", apiKey: "kimi-key" })],
      ["removeProvider", () => service.removeProvider("kimi")],
      ["updateImageGeneration", () => service.updateImageGeneration({ apiKey: "image-key", baseUrl: "https://images.example/v5", model: "m5" })],
      ["setProviderKey(image-generation)", () => service.setProviderKey("image-generation", "image-key-2")],
      ["clearProviderKey(image-generation)", () => service.clearProviderKey("image-generation")],
      ["setProviderKey(tavily)", () => service.setProviderKey("tavily", "tavily-key")],
      ["clearProviderKey(tavily)", () => service.clearProviderKey("tavily")],
      ["setProviderKey(deepseek)", () => service.setProviderKey("deepseek", "deepseek-key")],
      ["clearProviderKey(deepseek)", () => service.clearProviderKey("deepseek")],
      ["setProviderKey(speech-minimax)", () => service.setProviderKey("speech-minimax", "speech-key")],
      ["addProviderCredential", () => service.addProviderCredential({ provider: "openrouter", label: "Extra", apiKey: "or-extra" })],
      ["updateProviderCredential", () => service.updateProviderCredential("openrouter", "cred1", "Renamed")],
      ["removeProviderCredential", () => service.removeProviderCredential("openrouter", "cred1")],
      ["createCustomConnection", () => service.createCustomConnection({ providerId: "openrouter", connectionId: "proxy-one", displayName: "Proxy One", apiKey: "proxy-key", baseUrl: "https://proxy.example/v1", defaultModel: "gpt-4o-mini" })],
      ["updateCustomConnection", () => service.updateCustomConnection({ providerId: "openrouter", connectionId: "proxy-one", displayName: "Proxy Two", apiKey: "", baseUrl: "https://proxy.example/v2", defaultModel: "gpt-4o-mini" })],
      ["removeCustomConnection", () => service.removeCustomConnection("proxy-one")],
      ["writeAgentSystemPrompt", () => service.writeAgentSystemPrompt("Custom prompt")],
    ];
    const deltas: Array<[string, number]> = [];
    const env: Record<string, Record<string, string | undefined>> = {};
    for (const [name, step] of steps) {
      const before = reloadEnv.mock.calls.length;
      await step();
      deltas.push([name, reloadEnv.mock.calls.length - before]);
      env[name] = { TAVILY_API_KEY: process.env.TAVILY_API_KEY, LLM_TEMPERATURE: process.env.LLM_TEMPERATURE, IMAGE_GENERATION_MODEL: process.env.IMAGE_GENERATION_MODEL };
    }

    expect(deltas).toEqual([
      ["load", 1],
      ["update", 1],
      ["updateV2", 1],
      ["updateQuickOpenShortcut", 0],
      ["updateNamespaceV4", 1],
      ["updateModelStorage", 0],
      ["updateProviderConnection", 1],
      ["removeProvider", 1],
      ["updateImageGeneration", 1],
      ["setProviderKey(image-generation)", 1],
      ["clearProviderKey(image-generation)", 1],
      ["setProviderKey(tavily)", 1],
      ["clearProviderKey(tavily)", 1],
      ["setProviderKey(deepseek)", 1],
      ["clearProviderKey(deepseek)", 1],
      ["setProviderKey(speech-minimax)", 0],
      ["addProviderCredential", 0],
      ["updateProviderCredential", 0],
      ["removeProviderCredential", 0],
      // custom connection 经 applyNamespaceV4 落盘，所以也会写 env。
      ["createCustomConnection", 1],
      ["updateCustomConnection", 1],
      ["removeCustomConnection", 1],
      ["writeAgentSystemPrompt", 0],
    ]);
    expect(env["setProviderKey(tavily)"]).toEqual({ TAVILY_API_KEY: "tavily-key", LLM_TEMPERATURE: "1.2", IMAGE_GENERATION_MODEL: "m5" });
    expect(env["clearProviderKey(tavily)"]?.TAVILY_API_KEY).toBeUndefined();
    expect(env.load?.LLM_TEMPERATURE).toBe("1.2");
    // 现有行为：updateV2 把 temperature 清成 null，env 随之删掉；但下一次 updateNamespaceV4 从 v4 文件里的
    // taskDefaults.temperature（1.2，updateV2 没有写进去）重新解析，env 又回到 1.2。
    expect(env.updateV2?.LLM_TEMPERATURE).toBeUndefined();
    expect(env.updateNamespaceV4?.LLM_TEMPERATURE).toBe("1.2");
  });
});

// 17 T6 补充：变异检查发现 T1 没有覆盖变更通知、secrets 权限的兜底 chmod 和 system prompt 文件。
// 这些用例先对 T6 之前的代码生成快照、全部通过，再用于 T6 之后的代码。
describe("v4 change notifications", () => {
  it("notifies subscribers after each committed write with the changed namespaces", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, createCredentialId: sequentialIds() });
    const notifications: Array<{ revision: string; changedNamespaces: string[] }> = [];
    service.subscribeV4Changes((notification) => notifications.push(notification));
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["load", () => service.load()],
      ["update", () => service.update({ skills: { disabled: ["a"] } })],
      ["updateQuickOpenShortcut", () => service.updateQuickOpenShortcut({ enabled: false })],
      ["updateNamespaceV4", () => service.updateNamespaceV4({ namespace: "skills", expectedRevision: service.getV4().revision, patch: { disabled: ["c"] } })],
      ["updateModelStorage", () => service.updateModelStorage({ installedModels: { "kimi:kimi-k2.6": null } })],
      ["updateProviderConnection", () => service.updateProviderConnection({ provider: "kimi", apiKey: "kimi-key" })],
      ["updateImageGeneration", () => service.updateImageGeneration({ apiKey: "image-key", baseUrl: "https://images.example/v5", model: "m5" })],
      ["setProviderKey(tavily)", () => service.setProviderKey("tavily", "tavily-key")],
      ["setProviderKey(speech-minimax)", () => service.setProviderKey("speech-minimax", "speech-key")],
      ["addProviderCredential", () => service.addProviderCredential({ provider: "openrouter", label: "Extra", apiKey: "or-extra" })],
      ["createCustomConnection", () => service.createCustomConnection({ providerId: "openrouter", connectionId: "proxy-one", displayName: "Proxy One", apiKey: "proxy-key", baseUrl: "https://proxy.example/v1", defaultModel: "gpt-4o-mini" })],
      ["writeAgentSystemPrompt", () => service.writeAgentSystemPrompt("Custom prompt")],
    ];
    const perStep: Array<[string, string[][]]> = [];
    for (const [name, step] of steps) {
      const before = notifications.length;
      await step();
      const added = notifications.slice(before);
      // 每条通知带的是写入后的 revision；最后一条和 getV4() 一致。
      for (const notification of added) expect(notification.revision).toMatch(/^[0-9a-f]{64}$/);
      if (added.length > 0) expect(added[added.length - 1]?.revision).toBe(service.getV4().revision);
      perStep.push([name, added.map((notification) => notification.changedNamespaces)]);
    }
    await expectGolden("v4-notifications", perStep);
  });

  it("keeps the mutation successful when a listener throws, and stops after unsubscribe", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto });
    await service.load();
    const later = vi.fn();
    const unsubscribeThrowing = service.subscribeV4Changes(() => {
      throw new Error("listener failure");
    });
    const unsubscribeLater = service.subscribeV4Changes(later);

    const snapshot = await service.updateNamespaceV4({ namespace: "skills", expectedRevision: service.getV4().revision, patch: { disabled: ["x"] } });
    expect(snapshot.settings.skills.disabled).toEqual(["x"]);
    expect(later).toHaveBeenCalledTimes(1);

    unsubscribeThrowing();
    unsubscribeLater();
    await service.updateNamespaceV4({ namespace: "skills", expectedRevision: service.getV4().revision, patch: { disabled: ["y"] } });
    expect(later).toHaveBeenCalledTimes(1);
  });
});

describe("secrets file mode", () => {
  it("tightens secrets.json to 0600 even when the injected writer ignores the mode", async () => {
    const root = await makeRoot();
    const writeJson: JsonWriter = async (filePath, value) => {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o644 });
      await chmod(filePath, 0o644);
    };
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, writeJson });
    await service.load();
    expect(await service.setProviderKey("tavily", "tavily-key")).toEqual({ ok: true });
    expect(((await stat(join(root, "secrets.json"))).mode & 0o777).toString(8)).toBe("600");
  });
});

describe("agent system prompt file", () => {
  it("keeps an existing prompt file untouched on load and returns it on read", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    await mkdir(join(root, "prompts"), { recursive: true });
    await writeFile(join(root, "prompts", "v4-agent.md"), "existing prompt", "utf8");
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto });
    await service.load();

    expect(await readFile(join(root, "prompts", "v4-agent.md"), "utf8")).toBe("existing prompt");
    expect(await service.readAgentSystemPrompt()).toEqual({ path: join(root, "prompts", "v4-agent.md"), content: "existing prompt" });
  });

  it("recreates the default prompt when the file is missing at read time", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto });
    await service.load();
    const promptPath = join(root, "prompts", "v4-agent.md");
    const created = await readFile(promptPath, "utf8");
    expect(created.length).toBeGreaterThan(0);

    await rm(promptPath);
    expect(await service.readAgentSystemPrompt()).toEqual({ path: promptPath, content: created });
    expect(await readFile(promptPath, "utf8")).toBe(created);
  });

  it("truncates written prompts to 20000 characters and returns what was written", async () => {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto });
    await service.load();
    const promptPath = join(root, "prompts", "v4-agent.md");
    const long = "abcdefghij".repeat(2_500);

    const written = await service.writeAgentSystemPrompt(long);
    expect(written).toEqual({ path: promptPath, content: long.slice(0, 20_000) });
    expect(await readFile(promptPath, "utf8")).toBe(long.slice(0, 20_000));
    expect(await service.readAgentSystemPrompt()).toEqual(written);
  });
});

// 17 T7 补充：变异检查发现 v4 namespace 写入失败时的内存回滚、updateNamespaceV4 排队和旧接口的返回值没有覆盖。
// 同样先对 T7 之前（T6 提交）的代码跑通。
describe("v4 namespace updates", () => {
  async function loaded() {
    const root = await makeRoot({ "settings.json": "v4.json" });
    const writer = recordingWriter();
    const service = new SettingsService({ dataRoot: root, crypto: fixtureCrypto, writeJson: writer.writeJson });
    await service.load();
    writer.reset();
    return { root, writer, service };
  }

  it("rolls memory back when the namespace write fails before the bytes land", async () => {
    const { root, writer, service } = await loaded();
    const before = service.getV4();
    const fileBefore = await readFile(join(root, "settings.json"), "utf8");
    writer.failOn(1, "before");

    await expect(service.updateNamespaceV4({ namespace: "skills", expectedRevision: before.revision, patch: { disabled: ["lost"] } }))
      .rejects.toThrow("injected failure before write #1");
    expect(service.getV4()).toEqual(before);
    expect(await readFile(join(root, "settings.json"), "utf8")).toBe(fileBefore);
  });

  it("rolls memory back but leaves the new file when the namespace write fails after the bytes land", async () => {
    const { root, writer, service } = await loaded();
    const before = service.getV4();
    writer.failOn(1, "after");

    await expect(service.updateNamespaceV4({ namespace: "skills", expectedRevision: before.revision, patch: { disabled: ["landed"] } }))
      .rejects.toThrow("injected failure after write #1");
    // 现有行为：只回滚内存，不恢复文件（v4 namespace 路径没有 restoreFilesBestEffort）。
    expect(service.getV4()).toEqual(before);
    const onDisk = JSON.parse(await readFile(join(root, "settings.json"), "utf8")) as { skills: { disabled: string[] } };
    expect(onDisk.skills.disabled).toEqual(["landed"]);
    expect(writer.files()).toEqual(["settings.json"]);
  });

  it("queues updateNamespaceV4 behind an earlier mutation, so a revision taken before it conflicts", async () => {
    const { writer, service } = await loaded();
    const release = writer.gateOn(1);
    const revision = service.getV4().revision;

    const first = service.update({ skills: { disabled: ["first"] } });
    const second = service.updateNamespaceV4({ namespace: "skills", expectedRevision: revision, patch: { disabled: ["second"] } });
    await vi.waitFor(() => expect(writer.calls).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writer.calls).toHaveLength(1);
    release();

    await first;
    await expect(second).rejects.toBeInstanceOf(SettingsRevisionConflictError);
    expect(writer.calls).toHaveLength(1);
    expect(service.getV4().settings.skills.disabled).toEqual(["first"]);
  });

  it("returns the renderer transition view from update and the v2 view from updateV2", async () => {
    const { service } = await loaded();
    const updated = await service.update({ skills: { disabled: ["a"] } });
    expect(updated).toEqual(service.get());
    expect(updated).toHaveProperty("defaultModelId");
    const updatedV2 = await service.updateV2({ skills: { disabled: ["b"] } });
    expect(updatedV2).toEqual(service.getV2());
    expect(updatedV2).not.toHaveProperty("defaultModelId");
  });
});
