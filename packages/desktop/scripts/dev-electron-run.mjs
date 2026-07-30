#!/usr/bin/env node
/**
 * 等 renderer 与 main 编译产物就绪后启动 Electron。
 * 端口与 vite.config.mts 共用 VITE_DEV_PORT（默认 5173）。
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";

const port = process.env.VITE_DEV_PORT ?? "5173";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mainEntry = join(root, "dist-electron/main/index.js");
const devServerUrl = `http://127.0.0.1:${port}`;

await waitOn({
  resources: [`tcp:127.0.0.1:${port}`, `file:${mainEntry}`],
  timeout: 120_000,
});

const child = spawn("electron", [mainEntry], {
  cwd: root,
  env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
