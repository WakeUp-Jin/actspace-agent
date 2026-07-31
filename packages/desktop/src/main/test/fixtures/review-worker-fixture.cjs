const { parentPort } = require("node:worker_threads");

const timers = new Map();

parentPort.on("message", (request) => {
  if (request.type === "cancel") {
    const timer = timers.get(request.targetId);
    if (timer) clearTimeout(timer);
    timers.delete(request.targetId);
    return;
  }
  if (request.type !== "git") return;
  if (request.args[0] === "crash") {
    process.exit(2);
  }
  const respond = () => parentPort.postMessage({
    id: request.id,
    ok: true,
    value: { stdout: request.args.join(" "), stderr: "", exitCode: 0, timedOut: false, truncated: false },
  });
  if (request.args[0] === "delay") timers.set(request.id, setTimeout(respond, 1_000));
  else respond();
});
