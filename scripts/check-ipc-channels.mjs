// IPC channel 审计：channel 常量、main 的注册 / 发送、preload 的引用三者必须一致。
// 失败的情况：
//   1. 常量在 main 中既没有注册（handle / on）也没有发送（send）；
//   2. main 注册或发送了某个常量，但 preload 没有引用它（renderer 用不到，属于死 channel）；
//   3. main 用字符串字面量注册或发送了不在常量表里的 channel。
// 引用按「常量名.key」「别名.key」（`const channels = CONST`）或字符串值匹配。
// 13 落地 IPC 契约后，常量来源改为契约（见 13 T10）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CHANNEL_SOURCES = [
  { file: "packages/shared/src/runtime-v2/fixed-renderer.ts", constant: "RUNTIME_V2_FIXED_RENDERER_CHANNELS" },
  { file: "packages/shared/src/performance.ts", constant: "PERFORMANCE_CHANNELS" },
  { file: "packages/shared/src/english-learning.ts", constant: "ENGLISH_LEARNING_CHANNELS" },
  { file: "packages/shared/src/host-protocol/connections.ts", constant: "HOST_IPC" },
];

const MAIN_ROOT = "apps/desktop/src/main";
const PRELOAD_ROOT = "apps/desktop/src/preload";

/** 从源码中取出 `export const NAME = [Object.freeze(]{ key: "value", ... }` 的键值。 */
export function parseChannelConstant(source, constant) {
  const start = source.search(new RegExp(`export const ${constant}\\s*=`));
  if (start === -1) throw new Error(`未找到常量 ${constant}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  const body = source.slice(open + 1, close);
  const channels = new Map();
  for (const match of body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    channels.set(match[1], match[2]);
  }
  return channels;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 源码中指向某个常量的名字：常量本身，加上 `const alias = CONSTANT` 形式的别名。 */
function namesFor(source, constant) {
  const names = new Set([constant]);
  for (const match of source.matchAll(new RegExp(`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${constant}\\s*;`, "g"))) {
    names.add(match[1]);
  }
  return names;
}

/** 某个调用（`handle(`、`.send(` 等）的第一个参数引用了哪些 channel 值。 */
function channelsInCalls(source, calleePattern, constants) {
  const found = new Set();
  for (const { constant, channels } of constants) {
    for (const name of namesFor(source, constant)) {
      const pattern = new RegExp(`${calleePattern}\\(\\s*${escapeRegExp(name)}\\.([A-Za-z_$][\\w$]*)`, "g");
      for (const match of source.matchAll(pattern)) {
        const value = channels.get(match[1]);
        if (value) found.add(value);
      }
    }
  }
  for (const match of source.matchAll(new RegExp(`${calleePattern}\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g"))) {
    found.add(match[1]);
  }
  return found;
}

function referencedChannels(source, constants) {
  const found = new Set();
  for (const { constant, channels } of constants) {
    for (const name of namesFor(source, constant)) {
      for (const match of source.matchAll(new RegExp(`\\b${escapeRegExp(name)}\\.([A-Za-z_$][\\w$]*)`, "g"))) {
        const value = channels.get(match[1]);
        if (value) found.add(value);
      }
    }
    for (const value of channels.values()) {
      if (source.includes(`"${value}"`) || source.includes(`'${value}'`) || source.includes(`\`${value}\``)) found.add(value);
    }
  }
  return found;
}

// `handle(` 包括 ipcMain.handle 和各文件里包了一层的本地 handle；`on(` 只认 ipcMain，避免把 win.on("closed") 当成 channel。
const REGISTER_CALL = "(?:\\bhandle|\\bhandleOnce|\\bipcMain\\.on|\\bipcMain\\.once)";
const SEND_CALL = "(?:\\.send|#send|\\bsend)";

/**
 * @param {{ constants: { constant: string, channels: Map<string, string> }[], mainSources: { path: string, text: string }[], preloadSources: { path: string, text: string }[] }} input
 * @returns {string[]} 不一致的描述；空数组表示通过。
 */
export function auditIpcChannels({ constants, mainSources, preloadSources }) {
  const known = new Map();
  for (const { constant, channels } of constants) {
    for (const [key, value] of channels) known.set(value, `${constant}.${key}`);
  }

  const registered = new Set();
  const sent = new Set();
  const errors = [];
  for (const { path: file, text } of mainSources) {
    for (const value of channelsInCalls(text, REGISTER_CALL, constants)) {
      registered.add(value);
      if (!known.has(value)) errors.push(`main 注册了常量表之外的 channel "${value}"（${file}）`);
    }
    for (const value of channelsInCalls(text, SEND_CALL, constants)) {
      sent.add(value);
      if (!known.has(value)) errors.push(`main 发送了常量表之外的 channel "${value}"（${file}）`);
    }
  }

  const preloadReferenced = new Set();
  for (const { text } of preloadSources) {
    for (const value of referencedChannels(text, constants)) preloadReferenced.add(value);
  }

  for (const [value, label] of known) {
    const inMain = registered.has(value) || sent.has(value);
    if (!inMain) errors.push(`${label}（"${value}"）在 main 中没有注册，也没有发送`);
    else if (!preloadReferenced.has(value)) errors.push(`${label}（"${value}"）在 main 中${registered.has(value) ? "注册" : "发送"}了，但 preload 没有引用`);
  }
  return errors;
}

function readTree(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "test" && entry.name !== "node_modules") walk(full);
      } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        out.push({ path: path.relative(repoRoot, full), text: fs.readFileSync(full, "utf8") });
      }
    }
  };
  walk(root);
  return out;
}

export function runCheck(root = repoRoot) {
  const constants = CHANNEL_SOURCES.map(({ file, constant }) => ({
    constant,
    channels: parseChannelConstant(fs.readFileSync(path.join(root, file), "utf8"), constant),
  }));
  return {
    constants,
    errors: auditIpcChannels({
      constants,
      mainSources: readTree(path.join(root, MAIN_ROOT)),
      preloadSources: readTree(path.join(root, PRELOAD_ROOT)),
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { constants, errors } = runCheck();
  const total = constants.reduce((sum, { channels }) => sum + channels.size, 0);
  if (errors.length > 0) {
    console.error(`IPC channel 审计失败（${errors.length} 处）：`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`IPC channel 审计通过：${constants.length} 组常量，共 ${total} 个 channel。`);
}
