import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPackageReadmes, parseTable } from "../check-package-readmes.mjs";

const row = (id, loaders, defaultEnabled = true) => ({
  id,
  manifest: { display: { defaultEnabled } },
  module: `@actspace/${id}/plugin`,
  loaders,
});
const mapTable = (rows) => ["| 目录 | 职责 | 包数 | 类别 |", "| --- | --- | --- | --- |", ...rows].join("\n");
const pkgTable = (rows) =>
  ["| 包 | 角色 | 类别 | 默认 | 职责 |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");

async function repo({ map, readmes, packages }) {
  const root = await mkdtemp(join(tmpdir(), "actspace-package-readmes-"));
  for (const [capability, names] of Object.entries(packages)) {
    for (const name of names) {
      await mkdir(join(root, "packages", capability, name), { recursive: true });
      await writeFile(
        join(root, "packages", capability, name, "package.json"),
        JSON.stringify({ name: `@actspace/${name}` }),
      );
    }
  }
  await writeFile(join(root, "packages", "README.md"), map);
  for (const [capability, text] of Object.entries(readmes))
    await writeFile(join(root, "packages", capability, "README.md"), text);
  return root;
}

const goodMap = mapTable(["| [`alpha/`](alpha/README.md) | 示例 | 2 | 会话、库 |"]);
const goodReadme = pkgTable(["| `tool-a` | 工具 | 会话 | 开 | 示例 |", "| `lib-b` | 库 | 库 | — | 示例 |"]);
const catalog = [row("tool-a", ["harness"])];
const base = { packages: { alpha: ["tool-a", "lib-b"] } };

async function run(overrides) {
  const root = await repo({ ...base, map: goodMap, readmes: { alpha: goodReadme }, ...overrides });
  try {
    return await checkPackageReadmes({ repoRoot: root, catalog, outsideDefault: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("parseTable reads the table under a header", () => {
  assert.deepEqual(
    parseTable(goodReadme, "包").map((item) => item["类别"]),
    ["会话", "库"],
  );
  assert.equal(parseTable("没有表格", "包"), undefined);
});

test("READMEs that match the repository pass", async () => {
  assert.deepEqual(await run({}), []);
});

test("a package missing from its capability table fails", async () => {
  const failures = await run({ readmes: { alpha: pkgTable(["| `tool-a` | 工具 | 会话 | 开 | 示例 |"]) } });
  assert.deepEqual(failures, ['packages/alpha/README.md: package "lib-b" is not in the table']);
});

test("a table row for a package that does not exist fails", async () => {
  const failures = await run({ readmes: { alpha: `${goodReadme}\n| \`ghost\` | 库 | 库 | — | 示例 |` } });
  assert.deepEqual(failures, [
    'packages/alpha/README.md: table lists "ghost" but packages/alpha/ghost/ does not exist',
  ]);
});

test("a wrong category or default fails against the catalog", async () => {
  const failures = await run({
    readmes: { alpha: pkgTable(["| `tool-a` | 工具 | 全局 | 关 | 示例 |", "| `lib-b` | 库 | 库 | — | 示例 |"]) },
  });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /"tool-a" 类别 is "全局" but the catalog implies "会话"/);
  assert.match(failures[1], /"tool-a" 默认 is "关" but the manifest implies "开"/);
});

test("a wrong category in the map fails", async () => {
  const failures = await run({ map: mapTable(["| [`alpha/`](alpha/README.md) | 示例 | 2 | 全局、库 |"]) });
  assert.deepEqual(failures, ['packages/README.md: "alpha/" 类别 is "全局、库" but its packages imply "会话、库"']);
});

test("a capability directory missing from the map, or a wrong package count, fails", async () => {
  assert.deepEqual(await run({ map: mapTable([]) }), [
    'packages/README.md: capability directory "alpha/" is not in the table',
  ]);
  const failures = await run({ map: mapTable(["| [`alpha/`](alpha/README.md) | 示例 | 3 | 会话、库 |"]) });
  assert.deepEqual(failures, ['packages/README.md: "alpha/" says 3 packages but has 2']);
});

test("a missing capability README fails", async () => {
  const failures = await run({ readmes: {} });
  assert.deepEqual(failures, ["packages/alpha/README.md: missing"]);
});

test("without a catalog only the structure is checked", async () => {
  const root = await repo({
    ...base,
    map: goodMap,
    readmes: { alpha: pkgTable(["| `tool-a` | 工具 | 全局 | 关 | 示例 |", "| `lib-b` | 库 | 库 | — | 示例 |"]) },
  });
  try {
    assert.deepEqual(await checkPackageReadmes({ repoRoot: root }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
