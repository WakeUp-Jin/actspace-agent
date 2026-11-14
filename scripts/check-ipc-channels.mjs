// IPC channel 审计：以 desktop bridge 契约（`desktopBridgeContract`）为准（13 T10 起）。
// 失败的情况：
//   1. 契约里的 invoke / send 成员在 main 中没有注册（handle / on）；
//   2. 契约里的 event 成员在 main 中没有发送（send）；
//   3. main 注册或发送了契约之外的 channel（含字符串字面量），或注册 / 发送的方向与契约的类别不符；
//   4. channel 常量表里有契约没用到的 channel；
//   5. preload 没有按契约生成 bridge，或绕过契约直接引用了 channel；
//   6. main 在统一注册器（ipc/registry.ts）之外直接调用 ipcMain.handle / on，绕过 assertTrustedSender 与输入守卫。
// channel 值来自常量表；main 的引用按「常量名.key」「别名.key」（`const channels = CONST`）、
// 注册器的 `ipc.handle(contract.域.成员)` 或字符串值匹配。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CHANNEL_SOURCES = [
  { file: "packages/util/shared/src/runtime-v2/fixed-renderer.ts", constant: "RUNTIME_FIXED_RENDERER_CHANNELS" },
  { file: "packages/util/shared/src/resource-monitor.ts", constant: "RESOURCE_MONITOR_CHANNELS" },
  { file: "packages/util/shared/src/english-learning.ts", constant: "ENGLISH_LEARNING_CHANNELS" },
  { file: "packages/util/shared/src/host-protocol/connections.ts", constant: "HOST_IPC" },
];

export const CONTRACT_SOURCE = { file: "packages/util/shared/src/desktop-bridge/contract.ts", constant: "desktopBridgeContract" };

const MAIN_ROOT = "apps/desktop/src/main";
const PRELOAD_ROOT = "apps/desktop/src/preload";

/** 契约成员的构造函数 → 类别。`local` 成员没有 channel，不参与审计。 */
const SPEC_KINDS = { invoke: "invoke", invokeWithDefault: "invoke", send: "send", event: "event" };
const LOCAL_FACTORY = "local";

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

const IDENTIFIER = /[A-Za-z_$][\w$]*/y;

/** 把源码切成记号：名字、字符串（整个算一个）、`=>` 和单个标点；空白和注释丢掉。每个记号带行号。 */
function tokenize(source) {
  const tokens = [];
  let line = 1;
  let at = 0;
  while (at < source.length) {
    const ch = source[at];
    if (ch === "\n") { line += 1; at += 1; continue; }
    if (/\s/.test(ch)) { at += 1; continue; }
    if (ch === "/" && (source[at + 1] === "/" || source[at + 1] === "*")) {
      const found = source[at + 1] === "/" ? source.indexOf("\n", at) : source.indexOf("*/", at + 2);
      const end = found === -1 ? source.length : found + (source[at + 1] === "/" ? 0 : 2);
      for (let index = at; index < end; index += 1) if (source[index] === "\n") line += 1;
      at = end;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const startLine = line;
      let end = at + 1;
      while (end < source.length && source[end] !== ch) {
        if (source[end] === "\\") end += 1;
        if (source[end] === "\n") line += 1;
        end += 1;
      }
      tokens.push({ text: source.slice(at, end + 1), line: startLine, name: false });
      at = end + 1;
      continue;
    }
    IDENTIFIER.lastIndex = at;
    const word = IDENTIFIER.exec(source)?.[0];
    const text = word ?? (ch === "=" && source[at + 1] === ">" ? "=>" : ch);
    tokens.push({ text, line, name: word !== undefined });
    at += text.length;
  }
  return tokens;
}

/**
 * 从契约源码取出「域.成员」→ `{ channel, kind }`。成员形如 `member: invoke<…>(CH.key)`，
 * 其中 `CH` 可以是 import 时起的别名（`RUNTIME_FIXED_RENDERER_CHANNELS as CH`）。
 * 按记号读，不看缩进和换行：一个成员写成一行还是被格式化工具折成几行，读出来一样。
 * 认不出来的写法、引用了常量表里不存在的 key，都抛错，避免契约成员被静默跳过。
 */
export function parseContract(source, constants) {
  const aliases = new Map(constants.map(({ constant }) => [constant, constant]));
  for (const match of source.matchAll(/\b([A-Z][A-Z0-9_]*)\s+as\s+([A-Za-z_$][\w$]*)/g)) aliases.set(match[2], match[1]);
  const byConstant = new Map(constants.map(({ constant, channels }) => [constant, channels]));
  const tokens = tokenize(source);
  const start = tokens.findIndex((token, index) => token.text === CONTRACT_SOURCE.constant && tokens[index + 1]?.text === "=" && tokens[index + 2]?.text === "{");
  if (start === -1) throw new Error(`契约源码里没有找到 ${CONTRACT_SOURCE.constant} = { … }`);
  let at = start + 3;
  const fail = (what) => {
    const token = tokens[at];
    throw new Error(`契约源码${token ? `第 ${token.line} 行的 ${token.text}` : "末尾"} 认不出来：${what}。成员要写成 域: { 成员: 构造函数<类型>(常量.key) }`);
  };
  const expect = (text) => {
    if (tokens[at]?.text !== text) fail(`这里应该是 ${text}`);
    at += 1;
  };
  const name = (what) => {
    if (!tokens[at]?.name) fail(`这里应该是${what}`);
    at += 1;
    return tokens[at - 1].text;
  };
  /** 当前记号是 `open`，跳到和它配对的 `close` 后面。 */
  const skipGroup = (open, close) => {
    let depth = 0;
    for (; at < tokens.length; at += 1) {
      if (tokens[at].text === open) depth += 1;
      else if (tokens[at].text === close) depth -= 1;
      if (depth === 0) {
        at += 1;
        return;
      }
    }
    fail(`${open} 没有配对的 ${close}`);
  };

  const members = new Map();
  while (tokens[at]?.text !== "}") {
    const domain = name("域的名字");
    expect(":");
    expect("{");
    while (tokens[at]?.text !== "}") {
      const member = name("成员的名字");
      expect(":");
      const factory = name("构造函数");
      const kind = Object.hasOwn(SPEC_KINDS, factory) ? SPEC_KINDS[factory] : undefined;
      if (!kind && factory !== LOCAL_FACTORY) {
        at -= 1;
        fail(`${domain}.${member} 用了本检查不认识的构造函数`);
      }
      if (tokens[at]?.text === "<") skipGroup("<", ">");
      if (tokens[at]?.text !== "(") fail("这里应该是 (");
      const open = at;
      if (kind) {
        at += 1;
        const constantName = name("常量名");
        expect(".");
        const key = name("常量的 key");
        const channel = byConstant.get(aliases.get(constantName))?.get(key);
        if (!channel) throw new Error(`契约成员 ${domain}.${member} 引用了未知的 channel 常量 ${aliases.get(constantName) ?? constantName}.${key}`);
        members.set(`${domain}.${member}`, { channel, kind });
      }
      at = open;
      skipGroup("(", ")");
      if (tokens[at]?.text === ",") at += 1;
    }
    at += 1;
    if (tokens[at]?.text === ",") at += 1;
  }
  return members;
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

/** 源码中指向契约的名字：`desktopBridgeContract` 本身，加上 import 时起的别名。 */
function contractNames(source) {
  const names = new Set([CONTRACT_SOURCE.constant]);
  for (const match of source.matchAll(new RegExp(`${CONTRACT_SOURCE.constant}\\s+as\\s+([A-Za-z_$][\\w$]*)`, "g"))) names.add(match[1]);
  return names;
}

/** 某个调用（`handle(`、`.send(` 等）的第一个参数引用了哪些 channel 值。 */
function channelsInCalls(source, calleePattern, constants, contract, contractCallee = calleePattern) {
  const found = new Set();
  for (const name of contractNames(source)) {
    const pattern = new RegExp(`${contractCallee}\\(\\s*${escapeRegExp(name)}\\.([A-Za-z_$][\\w$]*)\\.([A-Za-z_$][\\w$]*)`, "g");
    for (const match of source.matchAll(pattern)) {
      const spec = contract.get(`${match[1]}.${match[2]}`);
      if (spec) found.add(spec.channel);
    }
  }
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

/** 源码中直接引用了哪些 channel：按常量名（含别名）或字符串值匹配。 */
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
// 注册器的 `ipc.handle(contract.…)` / `ipc.on(contract.…)`：只匹配契约引用，所以可以放开 `.on(`。
const CONTRACT_REGISTER_CALL = "(?:\\bhandle|\\.on)";
const SEND_CALL = "(?:\\.send|#send|\\bsend)";
// preload 按契约整体生成 bridge 的写法。
const PRELOAD_BUILDS_CONTRACT = /\bbuildBridge\(\s*desktopBridgeContract\b/;
// 只有注册器可以碰 ipcMain 的注册 API；其他文件必须走 `ipc.handle(contract.…)`，才会经过 assertTrustedSender 和 guard。
const REGISTRAR_PATH = "apps/desktop/src/main/ipc/registry.ts";
const RAW_IPC_MAIN_REGISTER = /\bipcMain\.(handle|handleOnce|on|once)\s*\(/g;

/**
 * @param {{
 *   constants: { constant: string, channels: Map<string, string> }[],
 *   contract: Map<string, { channel: string, kind: "invoke" | "send" | "event" }>,
 *   mainSources: { path: string, text: string }[],
 *   preloadSources: { path: string, text: string }[],
 *   registrarPath?: string,
 * }} input
 * @returns {string[]} 不一致的描述；空数组表示通过。
 */
export function auditIpcChannels({ constants, contract, mainSources, preloadSources, registrarPath = REGISTRAR_PATH }) {
  const byChannel = new Map();
  for (const [member, spec] of contract) byChannel.set(spec.channel, { member, ...spec });

  const errors = [];
  const registered = new Set();
  const sent = new Set();
  for (const { path: file, text } of mainSources) {
    if (file !== registrarPath) {
      for (const match of text.matchAll(RAW_IPC_MAIN_REGISTER)) {
        errors.push(`main 绕过统一注册器直接调用了 ipcMain.${match[1]}（${file}），请改用 ipc.${match[1] === "on" || match[1] === "once" ? "on" : "handle"}(contract.…)`);
      }
    }
    for (const value of channelsInCalls(text, REGISTER_CALL, constants, contract, CONTRACT_REGISTER_CALL)) {
      registered.add(value);
      const spec = byChannel.get(value);
      if (!spec) errors.push(`main 注册了契约之外的 channel "${value}"（${file}）`);
      else if (spec.kind === "event") errors.push(`main 注册了契约中的事件 ${spec.member}（"${value}"），事件只能由 main 发送（${file}）`);
    }
    for (const value of channelsInCalls(text, SEND_CALL, constants, contract)) {
      sent.add(value);
      const spec = byChannel.get(value);
      if (!spec) errors.push(`main 发送了契约之外的 channel "${value}"（${file}）`);
      else if (spec.kind !== "event") errors.push(`main 发送了契约中的 ${spec.kind} 成员 ${spec.member}（"${value}"），只有事件由 main 发送（${file}）`);
    }
  }

  for (const [member, { channel, kind }] of contract) {
    if (kind === "event" ? !sent.has(channel) : !registered.has(channel)) {
      errors.push(`契约 ${member}（"${channel}"）在 main 中没有${kind === "event" ? "发送" : "注册"}`);
    }
  }

  for (const { constant, channels } of constants) {
    for (const [key, value] of channels) {
      if (!byChannel.has(value)) errors.push(`常量 ${constant}.${key}（"${value}"）不在契约里`);
    }
  }

  if (!preloadSources.some(({ text }) => PRELOAD_BUILDS_CONTRACT.test(text))) {
    errors.push("preload 没有按 desktopBridgeContract 生成 bridge（buildBridge(desktopBridgeContract, …)）");
  }
  for (const { path: file, text } of preloadSources) {
    for (const value of referencedChannels(text, constants)) {
      errors.push(`preload 绕过契约直接引用了 channel "${value}"（${file}）`);
    }
  }
  return errors;
}

/** 读出 `dir` 下的源码；`path` 相对 `root`，用 `/` 分隔。 */
function readTree(root, dir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "test" && entry.name !== "node_modules") walk(full);
      } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        out.push({ path: path.relative(root, full).split(path.sep).join("/"), text: fs.readFileSync(full, "utf8") });
      }
    }
  };
  walk(path.join(root, dir));
  return out;
}

export function runCheck(root = repoRoot) {
  const constants = CHANNEL_SOURCES.map(({ file, constant }) => ({
    constant,
    channels: parseChannelConstant(fs.readFileSync(path.join(root, file), "utf8"), constant),
  }));
  const contract = parseContract(fs.readFileSync(path.join(root, CONTRACT_SOURCE.file), "utf8"), constants);
  return {
    constants,
    contract,
    errors: auditIpcChannels({
      constants,
      contract,
      mainSources: readTree(root, MAIN_ROOT),
      preloadSources: readTree(root, PRELOAD_ROOT),
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { contract, errors } = runCheck();
  if (errors.length > 0) {
    console.error(`IPC channel 审计失败（${errors.length} 处）：`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const counts = { invoke: 0, send: 0, event: 0 };
  for (const { kind } of contract.values()) counts[kind] += 1;
  console.log(`IPC channel 审计通过：契约 ${contract.size} 个 channel（invoke ${counts.invoke} / send ${counts.send} / event ${counts.event}）。`);
}
