import { spawn, type ChildProcess } from "node:child_process";
import { createServer, createConnection } from "node:net";
export interface SshTunnel { port: number; close(): Promise<void> }
/** Only forwards to server loopback; relies on the user's existing OpenSSH trust configuration. */
export async function openSshTunnel(alias: string, remotePort: number, configFile?: string): Promise<SshTunnel> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(alias) || !Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new Error("Invalid SSH host alias or port");
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  const child = spawn("/usr/bin/ssh", [...(configFile ? ["-F", configFile] : []), "-N", "-T", "-o", "BatchMode=yes", "-o", "ForwardAgent=no", "-o", "ControlMaster=no", "-o", "ControlPath=none", "-o", "StrictHostKeyChecking=yes", "-o", "ExitOnForwardFailure=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=3", "-L", `127.0.0.1:${port}:127.0.0.1:${remotePort}`, "--", alias], { stdio: ["ignore", "ignore", "pipe"] });
  let error = "", failure: Error | undefined;
  child.stderr.on("data", bytes => { error = (error + String(bytes)).slice(-4096); });
  child.once("error", value => { failure = value; });
  child.once("exit", () => { failure = new Error(error.trim() || "SSH tunnel exited"); });
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (failure) throw failure;
      if (await listening(port)) return { port, close: () => stop(child) };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("SSH tunnel startup timed out");
  } catch (error) { await stop(child); throw error; }
}
function listening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(200);
    const done = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.once("connect", () => done(true)); socket.once("error", () => done(false)); socket.once("timeout", () => done(false));
  });
}
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 1000);
    child.once("exit", () => { clearTimeout(timer); resolve(); }); child.kill("SIGTERM");
  });
}
