import { spawn } from "node:child_process";

const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "ignore",
});

process.stdout.write(`${JSON.stringify({ childPid: process.pid, grandchildPid: grandchild.pid })}\n`);
setInterval(() => {}, 1_000);
