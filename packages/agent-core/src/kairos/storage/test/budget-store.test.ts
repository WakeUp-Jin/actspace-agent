import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KairosBudgetStore } from "../budget-store";

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kairos-budget-"));
  return join(dir, "budget-state.json");
}

describe("KairosBudgetStore", () => {
  it("文件不存在 → 默认 enabled=false / balance=0 / 不耗尽", async () => {
    const store = new KairosBudgetStore({ filePath: await tmpFile() });
    await store.load();
    expect(store.getRuntime()).toEqual({ enabled: false, balanceCny: 0, exhausted: false });
  });

  it("load 读取已有合法文件", async () => {
    const fp = await tmpFile();
    await writeFile(fp, JSON.stringify({ schemaVersion: 1, enabled: true, balanceCny: 2.5 }), "utf8");
    const store = new KairosBudgetStore({ filePath: fp });
    await store.load();
    expect(store.getRuntime()).toEqual({ enabled: true, balanceCny: 2.5, exhausted: false });
  });

  it("坏文件 → 回退默认（不误伤、无限运行）", async () => {
    const fp = await tmpFile();
    await writeFile(fp, "{ not valid json", "utf8");
    const store = new KairosBudgetStore({ filePath: fp });
    await store.load();
    expect(store.getRuntime()).toEqual({ enabled: false, balanceCny: 0, exhausted: false });
  });

  it("setBudget 覆盖 enabled+balance 并立即落盘", async () => {
    const fp = await tmpFile();
    const store = new KairosBudgetStore({ filePath: fp });
    await store.load();
    await store.setBudget({ enabled: true, balanceCny: 5 });
    expect(store.getRuntime()).toEqual({ enabled: true, balanceCny: 5, exhausted: false });
    const persisted = JSON.parse(await readFile(fp, "utf8"));
    expect(persisted).toMatchObject({ schemaVersion: 1, enabled: true, balanceCny: 5 });
  });

  it("deduct 扣减余额；≤0 且 enabled 时 exhausted=true", async () => {
    const fp = await tmpFile();
    const store = new KairosBudgetStore({ filePath: fp });
    await store.load();
    await store.setBudget({ enabled: true, balanceCny: 0.03 });
    store.deduct(0.01);
    expect(store.getBalance()).toBeCloseTo(0.02, 6);
    expect(store.getRuntime().exhausted).toBe(false);
    store.deduct(0.05);
    expect(store.getBalance()).toBeLessThanOrEqual(0);
    expect(store.getRuntime().exhausted).toBe(true);
    await store.flush();
    const persisted = JSON.parse(await readFile(fp, "utf8"));
    expect(persisted.balanceCny).toBeLessThanOrEqual(0);
  });

  it("deduct 忽略非正 / NaN", async () => {
    const store = new KairosBudgetStore({ filePath: await tmpFile() });
    await store.load();
    await store.setBudget({ enabled: true, balanceCny: 1 });
    store.deduct(0);
    store.deduct(-5);
    store.deduct(Number.NaN);
    expect(store.getBalance()).toBe(1);
  });

  it("enabled=false 时即便余额 ≤0 也不 exhausted（无限运行）", async () => {
    const store = new KairosBudgetStore({ filePath: await tmpFile() });
    await store.load();
    await store.setBudget({ enabled: false, balanceCny: 0 });
    expect(store.getRuntime().exhausted).toBe(false);
  });

  it("setBudget 非法 balance（NaN / 负数）保持原值", async () => {
    const store = new KairosBudgetStore({ filePath: await tmpFile() });
    await store.load();
    await store.setBudget({ enabled: true, balanceCny: 3 });
    await store.setBudget({ enabled: true, balanceCny: Number.NaN });
    expect(store.getBalance()).toBe(3);
    await store.setBudget({ enabled: true, balanceCny: -1 });
    expect(store.getBalance()).toBe(3);
  });

  it("deduct 后 flush 落盘余额", async () => {
    const fp = await tmpFile();
    const store = new KairosBudgetStore({ filePath: fp, debounceMs: 10_000 });
    await store.load();
    await store.setBudget({ enabled: true, balanceCny: 1 });
    store.deduct(0.4);
    await store.flush();
    const persisted = JSON.parse(await readFile(fp, "utf8"));
    expect(persisted.balanceCny).toBeCloseTo(0.6, 6);
  });
});
