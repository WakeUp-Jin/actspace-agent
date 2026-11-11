/** 最小的 Chrome DevTools 协议客户端：只用 Node 自带的 WebSocket，不引入浏览器自动化依赖。 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/local/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`CHROME_PATH 指向的文件不存在：${fromEnv}`);
    return fromEnv;
  }
  const found = CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error("没有找到 Chrome / Chromium，请用 CHROME_PATH 指定可执行文件。");
  return found;
}

function waitForDevtoolsUrl(child) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`Chrome 30 秒内没有给出调试地址：\n${buffer}`)), 30_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve(match[1]);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome 提前退出（${code}）：\n${buffer}`));
    });
  });
}

/**
 * 启动一个无头 Chrome，返回 `newPage()` 与 `close()`。
 * 容器里以 root 运行时需要 `CHROME_NO_SANDBOX=1`。
 */
export async function launchChrome({ width, height }) {
  const userDataDir = await mkdtemp(join(tmpdir(), "actspace-promo-chrome-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "--hide-scrollbars",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ];
  if (process.env.CHROME_NO_SANDBOX === "1") args.push("--no-sandbox");
  const child = spawn(findChrome(), args, { stdio: ["ignore", "ignore", "pipe"] });

  let socket;
  try {
    const url = await waitForDevtoolsUrl(child);
    socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("连不上 Chrome 调试端口")), { once: true });
    });
  } catch (error) {
    child.kill("SIGKILL");
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  });

  function send(method, params = {}, sessionId) {
    nextId += 1;
    const id = nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  async function newPage({ deviceScaleFactor = 1 } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);

    function once(method) {
      return new Promise((resolve) => {
        const listener = (message) => {
          if (message.sessionId !== sessionId || message.method !== method) return;
          listeners.delete(listener);
          resolve(message.params);
        };
        listeners.add(listener);
      });
    }

    await call("Page.enable");
    await call("Runtime.enable");
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });

    return {
      call,
      once,
      async goto(url) {
        const loaded = once("Page.loadEventFired");
        const { errorText } = await call("Page.navigate", { url });
        if (errorText) throw new Error(`打不开 ${url}：${errorText}`);
        await loaded;
      },
      async evaluate(expression) {
        const { result, exceptionDetails } = await call("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (exceptionDetails) {
          const detail = exceptionDetails.exception?.description ?? exceptionDetails.text;
          throw new Error(`页面脚本出错：${detail}`);
        }
        return result.value;
      },
      async screenshot({ format = "png", quality } = {}) {
        const { data } = await call("Page.captureScreenshot", {
          format,
          quality,
          optimizeForSpeed: true,
        });
        return Buffer.from(data, "base64");
      },
      onConsole(handler) {
        listeners.add((message) => {
          if (message.sessionId !== sessionId) return;
          if (message.method === "Runtime.exceptionThrown") {
            const details = message.params.exceptionDetails;
            handler("exception", details.exception?.description ?? details.text);
          } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
            handler("error", message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
          }
        });
      },
    };
  }

  async function close() {
    for (const entry of pending.values()) entry.reject(new Error("Chrome 已关闭"));
    pending.clear();
    socket.close();
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;
    }
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  }

  return { newPage, close };
}
