const { mkdir, writeFile, rm } = require("node:fs/promises");
const { join } = require("node:path");

async function main() {
  const [sessionDir, sessionId] = process.argv.slice(2);
  const lockDir = join(sessionDir, ".writer-lock");
  const stamp = new Date().toISOString();
  const owner = {
    sessionId,
    runtimeId: "child-runtime",
    pid: process.pid,
    nonce: `child-${process.pid}`,
    acquiredAt: stamp,
    heartbeatAt: stamp,
  };
  await mkdir(lockDir, { recursive: false });
  await writeFile(join(lockDir, "owner.json"), `${JSON.stringify(owner)}\n`, { mode: 0o600 });
  process.stdout.write("ready\n");
  process.stdin.resume();
  process.stdin.once("end", async () => {
    await rm(lockDir, { recursive: true, force: true });
    process.exit(0);
  });
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exit(1);
});
