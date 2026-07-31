import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const preset = process.argv[2] ?? "standard";
const supported = new Set(["standard", "file-count", "changed-lines", "changed-bytes"]);
if (!supported.has(preset)) {
  console.error(`Unknown preset '${preset}'. Use: ${[...supported].join(", ")}`);
  process.exit(1);
}

const root = await mkdtemp(join(tmpdir(), `actspace-review-${preset}-`));
await git(["init", "-b", "main"]);
await git(["config", "user.email", "review-fixture@example.com"]);
await git(["config", "user.name", "Review Fixture"]);

if (preset === "standard") await createLineFixture(8, 63);
if (preset === "file-count") await createLineFixture(129, 1);
if (preset === "changed-lines") await createLineFixture(20, 451);
if (preset === "changed-bytes") await createByteFixture();

console.log(root);

async function createLineFixture(fileCount, linesPerFile) {
  const before = Array.from({ length: linesPerFile }, (_, index) => `before ${index}`).join("\n") + "\n";
  await Promise.all(Array.from({ length: fileCount }, (_, index) => writeFile(join(root, `file-${index}.txt`), before, "utf8")));
  await commitBase();
  await Promise.all(Array.from({ length: fileCount }, (_, index) => {
    const after = Array.from({ length: linesPerFile }, (_, line) => `after ${index} ${line}`).join("\n") + "\n";
    return writeFile(join(root, `file-${index}.txt`), after, "utf8");
  }));
}

async function createByteFixture() {
  await writeFile(join(root, "large.txt"), "before\n", "utf8");
  await commitBase();
  await writeFile(join(root, "large.txt"), `${"x".repeat(13 * 1024 * 1024)}\n`, "utf8");
}

async function commitBase() {
  await git(["add", "."]);
  await git(["commit", "-m", "base"]);
}

async function git(args) {
  await execFileAsync("git", args, { cwd: root });
}
