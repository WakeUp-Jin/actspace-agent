// 依次跑完一组命令，前一步失败不拦后一步，最后汇总。`pnpm test`（scripts/run-tests.mjs）用它。
import { spawn } from "node:child_process";

function run(command, cwd) {
  return new Promise((done) => {
    const child = spawn(command, { cwd, stdio: "inherit", shell: true });
    child.on("error", (error) => done({ ok: false, detail: error.message }));
    child.on("close", (code, signal) => done({ ok: code === 0, detail: signal === null ? `退出码 ${code}` : `被 ${signal} 终止` }));
  });
}

/** 每一步是 `{ name, command }`，command 交给 shell 执行。返回进程该用的退出码：全部通过是 0，否则是 1。 */
export async function runSteps(steps, { cwd, log = console.log }) {
  const results = [];
  for (const step of steps) {
    log(`\n== ${step.name}：${step.command}`);
    const started = Date.now();
    const result = await run(step.command, cwd);
    results.push({ ...step, ...result, seconds: Math.round((Date.now() - started) / 1000) });
  }
  log("\n== 汇总");
  for (const result of results) {
    log(`${result.ok ? "通过" : "失败"}  ${result.name}（${result.command}，${result.seconds} s${result.ok ? "" : `，${result.detail}`}）`);
  }
  return results.every((result) => result.ok) ? 0 : 1;
}
