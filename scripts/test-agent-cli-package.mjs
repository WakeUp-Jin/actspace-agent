import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const target = `${process.platform}-${process.arch}`;
const artifactRoot = resolve(readOption("--artifact-dir") ?? join("artifacts", "agent-cli-managed", target));
const archive = join(artifactRoot, "actspace-agent.tar.gz");
const isolated = await mkdtemp(join(tmpdir(), "actspace-cli-package-"));
try {
  execFileSync("tar", ["-xzf", archive, "-C", isolated], { stdio: "inherit" });
  const executable = join(isolated, "actspace-agent", "bin", "actspace-agent"); const dataDir = join(isolated, "data"); const homeDir = join(isolated, "home");
  smoke(executable, ["--help"], { HOME: homeDir }); smoke(executable, ["--version"], { HOME: homeDir });
  const first = smoke(executable, ["run", "--mock", "--json", "--persist", "--data-dir", dataDir, "--workspace", process.cwd(), "--input", "package smoke"], { HOME: homeDir });
  const result = JSON.parse(first.stdout); if (!result.ok || !result.persistent || !result.sessionId) throw new Error("Persistent managed CLI smoke did not return a Session.");
  const second = smoke(executable, ["run", "--mock", "--json", "--resume", result.sessionId, "--data-dir", dataDir, "--workspace", process.cwd(), "--input", "resume smoke"], { HOME: homeDir });
  if (JSON.parse(second.stdout).sessionId !== result.sessionId) throw new Error("Managed CLI resume changed Session identity.");
  const packageJson = JSON.parse(await readFile(join(isolated, "actspace-agent", "package.json"), "utf8")); if (packageJson.engines?.node !== ">=22.19.0") throw new Error("Managed package is missing the Node engine gate.");
  const dependencies = JSON.parse(await readFile(join(isolated, "actspace-agent", "DEPENDENCIES.json"), "utf8"));
  if (dependencies.schemaVersion !== 1 || !Array.isArray(dependencies.packages) || dependencies.packages.length === 0) throw new Error("Managed package dependency inventory is missing or empty.");
  const notices = await readFile(join(isolated, "actspace-agent", "THIRD_PARTY_NOTICES.md"), "utf8");
  if (!notices.includes("Third-Party Notices")) throw new Error("Managed package license notice is missing.");
  const integrity = await readFile(join(isolated, "actspace-agent", "MANIFEST.sha256"), "utf8");
  if (!integrity.includes("  package.json\n") || !integrity.includes("  dist/cli.js\n")) throw new Error("Managed package integrity manifest is incomplete.");
  process.stdout.write("managed CLI package smoke passed\n");
} finally { await rm(isolated, { recursive: true, force: true }); }

function smoke(executable, args, extraEnv) { const result = spawnSync(executable, args, { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, ...extraEnv } }); if (result.status !== 0) throw new Error(`${executable} ${args.join(" ")} failed (${result.status}): ${result.stderr}`); return result; }
function readOption(name) { const index = process.argv.indexOf(name); if (index < 0) return undefined; const value = process.argv[index + 1]; if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`); return value; }
