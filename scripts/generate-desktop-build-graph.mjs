#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = join(repoRoot, "packages");
const check = process.argv.includes("--check");
const roots = ["@actspace/runtime", "@actspace/client"];

async function packageDirectories(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) return [directory];
  const children = entries.filter((entry) => entry.isDirectory());
  return (await Promise.all(children.map((entry) => packageDirectories(join(directory, entry.name))))).flat();
}

const packages = new Map();
for (const directory of await packageDirectories(packagesRoot)) {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  packages.set(manifest.name, { directory, manifest });
}

const visited = new Set();
const visiting = new Set();
const ordered = [];

function dependencies(name) {
  const project = packages.get(name);
  if (!project) throw new Error(`Unknown workspace package: ${name}`);
  return Object.keys(project.manifest.dependencies ?? {})
    .filter((dependency) => dependency.startsWith("@actspace/"))
    .sort();
}

function visit(name) {
  if (visited.has(name)) return;
  if (visiting.has(name)) throw new Error(`Circular workspace dependency: ${name}`);
  visiting.add(name);
  for (const dependency of dependencies(name)) visit(dependency);
  visiting.delete(name);
  visited.add(name);
  ordered.push(name);
}

for (const root of roots) visit(root);

async function sync(path, content) {
  if (check) {
    const existing = await readFile(path, "utf8").catch(() => "");
    if (existing !== content) throw new Error(`Outdated build graph: ${relative(repoRoot, path)}`);
  } else {
    await writeFile(path, content);
  }
}

for (const name of ordered) {
  const { directory } = packages.get(name);
  const references = dependencies(name).map((dependency) => ({
    path: `./${relative(directory, packages.get(dependency).directory).replaceAll("\\", "/")}/tsconfig.build.json`,
  }));
  const config = {
    extends: "./tsconfig.json",
    compilerOptions: {
      composite: true,
      incremental: true,
      tsBuildInfoFile: "./dist/.tsbuildinfo",
    },
    references,
  };
  await sync(join(directory, "tsconfig.build.json"), `${JSON.stringify(config, null, 2)}\n`);
}

const solution = {
  files: [],
  references: roots.map((name) => ({
    path: `./${relative(repoRoot, packages.get(name).directory).replaceAll("\\", "/")}/tsconfig.build.json`,
  })),
};
await sync(join(repoRoot, "tsconfig.desktop-deps.json"), `${JSON.stringify(solution, null, 2)}\n`);
console.log(`${check ? "Checked" : "Generated"} ${ordered.length} Desktop dependency projects`);
