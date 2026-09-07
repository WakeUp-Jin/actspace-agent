import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const strict = process.argv.includes("--strict");
const sourceRoots = ["apps", "packages", "scripts"];
const findings = {
  monolith: [],
  deepImports: [],
  genericPlugins: [],
  retiredPaths: [],
};

const sourceExtensions = /\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/;
const retired = ["kairos:", "plugins:fs-watch:", "/eval", "@actspace/agent-core"];

async function walk(path) {
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith("dist") || entry.name === ".tmp") continue;
    const target = join(path, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (sourceExtensions.test(entry.name)) await scanFile(target);
  }
}

async function scanFile(path) {
  const source = await readFile(path, "utf8");
  const label = relative(repoRoot, path);
  // Test fixtures intentionally contain retired package names to exercise the
  // documentation checker; they are not runtime reachability edges.
  if (label.startsWith("scripts/test/")) return;
  if (!label.endsWith("scripts/check-package-cutover.mjs") && !label.endsWith("scripts/check-v2-legacy-removal.mjs") && !label.endsWith("scripts/check-package-boundaries.mjs")) {
    if (source.includes("@actspace/agent-runtime")) findings.monolith.push(label);
    if (/packages\/agent-runtime\/src\//.test(source) || /@actspace\/[^"']+\/src\//.test(source)) findings.deepImports.push(label);
    if (/(?:^|[\\/])plugins(?:[\\/]|['"])/.test(source) && !source.includes("browser-bridge")) findings.genericPlugins.push(label);
    for (const token of retired) if (source.includes(token)) findings.retiredPaths.push(`${label}: ${token}`);
  }
}

for (const root of sourceRoots) await walk(join(repoRoot, root));

const total = Object.values(findings).reduce((sum, values) => sum + values.length, 0);
for (const [category, values] of Object.entries(findings)) {
  process.stdout.write(`${category}: ${values.length}\n`);
  for (const value of values.slice(0, 40)) process.stdout.write(`  ${value}\n`);
  if (values.length > 40) process.stdout.write(`  ... ${values.length - 40} more\n`);
}

if (strict && total > 0) {
  process.stderr.write(`package cutover check failed (${total} finding(s)); old runtime reachability remains.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`package cutover check completed (${total} finding(s); use --strict for the final gate)\n`);
}
