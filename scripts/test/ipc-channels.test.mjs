import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditIpcChannels, parseChannelConstant, parseContract, runCheck } from "../check-ipc-channels.mjs";

const constantsSource = `
export const DEMO_CHANNELS = Object.freeze({
  ping: "demo:ping",
  theme: "demo:theme",
  changed: "demo:changed",
});
`;

const constants = [{ constant: "DEMO_CHANNELS", channels: parseChannelConstant(constantsSource, "DEMO_CHANNELS") }];

const contractSource = `
import { DEMO_CHANNELS as CH } from "./demo";
export const desktopBridgeContract = {
  demo: {
    ping: invokeWithDefault<{ id: string }, string>(CH.ping, {}),
    setTheme: send<"light" | "dark">(CH.theme),
    pick: local<(file: Handle) => string>(),
  },
  events: {
    changed: event<void>(CH.changed, { reason: "normal" }),
  },
} as const;
`;

const contract = parseContract(contractSource, constants);

const consistentMain = `
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
ipc.handle(contract.demo.ping, () => "pong");
ipc.on(contract.demo.setTheme, () => undefined);
win.webContents.send(DEMO_CHANNELS.changed, value);
win.on("closed", () => undefined);
`;

const consistentPreload = `
const bridge = buildBridge(desktopBridgeContract, transport, locals);
contextBridge.exposeInMainWorld("actspace", bridge);
`;

const audit = (main, preload = consistentPreload, input = {}) => auditIpcChannels({
  constants,
  contract,
  mainSources: [{ path: "main.ts", text: main }],
  preloadSources: [{ path: "preload.ts", text: preload }],
  ...input,
});

test("parses channel constants, with or without Object.freeze", () => {
  assert.deepEqual([...constants[0].channels], [["ping", "demo:ping"], ["theme", "demo:theme"], ["changed", "demo:changed"]]);
  assert.deepEqual(
    [...parseChannelConstant('export const X = { a: "x:a" } as const;', "X")],
    [["a", "x:a"]],
  );
});

test("parses contract members with their kind through the import alias, skipping local members", () => {
  assert.deepEqual([...contract], [
    ["demo.ping", { channel: "demo:ping", kind: "invoke" }],
    ["demo.setTheme", { channel: "demo:theme", kind: "send" }],
    ["events.changed", { channel: "demo:changed", kind: "event" }],
  ]);
});

test("rejects a contract member that points at an unknown constant key", () => {
  assert.throws(
    () => parseContract(contractSource.replace("CH.theme", "CH.missing"), constants),
    /demo\.setTheme 引用了未知的 channel 常量 DEMO_CHANNELS\.missing/,
  );
});

test("reads the same contract however its members are wrapped or indented", () => {
  // 格式化工具把超过行宽的成员折成几行；类型参数里有对象、函数、字符串和 `=>` 也不影响。
  const wrapped = `
import { DEMO_CHANNELS as CH } from "./demo";
/** desktopBridgeContract = { 这一行在注释里，不算 } */
export const desktopBridgeContract = {
	demo: {
		/** 说明里的 { 括号 ) 和 "引号 不算。 */
		ping: invokeWithDefault<
			{ id: string; filter: (value: Array<Record<string, number>>) => boolean },
			string
		>(
			CH.ping, // 行尾注释
			{},
		),
		setTheme:
			send<"light>" | 'dark)'>(CH.theme),
		pick: local<
			(file: Handle) => string
		>(),
	},
	events: { changed: event<void>(CH.changed, { reason: pick("normal") }) }
} as const;
export const later = { other: { ping: invoke<void>(CH.ping) } };
`;
  assert.deepEqual([...parseContract(wrapped, constants)], [...contract]);
});

test("rejects contract shapes it cannot read instead of skipping them", () => {
  const cases = [
    [contractSource.replace("send<", "sendLater<"), /第 6 行的 sendLater 认不出来：demo\.setTheme 用了本检查不认识的构造函数/],
    [contractSource.replace("changed: event<void>(CH.changed, { reason: \"normal\" }),", "changed: { nested: event<void>(CH.changed) },"), /第 10 行的 \{ 认不出来：这里应该是构造函数/],
    [contractSource.replace("(CH.theme)", "()"), /第 6 行的 \) 认不出来：这里应该是常量名/],
    [contractSource.replace("(CH.theme)", '("demo:theme")'), /第 6 行的 "demo:theme" 认不出来：这里应该是常量名/],
    [contractSource.replace("setTheme: ", '"set-theme": '), /第 6 行的 "set-theme" 认不出来：这里应该是成员的名字/],
    [contractSource.replace("  events: {", "  ...shared,\n  events: {"), /第 9 行的 \. 认不出来：这里应该是域的名字/],
    [contractSource.replace("} as const;", ""), /末尾 认不出来/],
    [contractSource.replace("desktopBridgeContract = {", "desktopBridgeContract: Contract = {"), /没有找到 desktopBridgeContract = \{ … \}/],
  ];
  for (const [source, message] of cases) assert.throws(() => parseContract(source, constants), message);
});

test("passes when main registers every invoke / send member and sends every event", () => {
  assert.deepEqual(audit(consistentMain), []);
});

test("resolves channels through constant aliases and string literals, but only the registrar may touch ipcMain", () => {
  const main = `
const channels = DEMO_CHANNELS;
handle(channels.ping, () => "pong");
ipcMain.on("demo:theme", () => undefined);
win.webContents.send(DEMO_CHANNELS.changed, value);
`;
  assert.deepEqual(audit(main), [
    "main 绕过统一注册器直接调用了 ipcMain.on（main.ts），请改用 ipc.on(contract.…)",
  ]);
  assert.deepEqual(audit(main, consistentPreload, { registrarPath: "main.ts" }), []);
});

test("fails on every raw ipcMain registration outside the registrar, even for contract channels", () => {
  const main = `${consistentMain}
ipcMain.handle(DEMO_CHANNELS.ping, () => "pong");
ipcMain.handleOnce(DEMO_CHANNELS.ping, () => "pong");
ipcMain.once(DEMO_CHANNELS.theme, () => undefined);
`;
  assert.deepEqual(audit(main), [
    "main 绕过统一注册器直接调用了 ipcMain.handle（main.ts），请改用 ipc.handle(contract.…)",
    "main 绕过统一注册器直接调用了 ipcMain.handleOnce（main.ts），请改用 ipc.handle(contract.…)",
    "main 绕过统一注册器直接调用了 ipcMain.once（main.ts），请改用 ipc.on(contract.…)",
  ]);
});

test("fails when a contract invoke or send member is not registered in main", () => {
  const main = consistentMain
    .replace('ipc.handle(contract.demo.ping, () => "pong");', "")
    .replace("ipc.on(contract.demo.setTheme, () => undefined);", "");
  assert.deepEqual(audit(main), [
    '契约 demo.ping（"demo:ping"）在 main 中没有注册',
    '契约 demo.setTheme（"demo:theme"）在 main 中没有注册',
  ]);
});

test("fails when a contract event is never sent by main", () => {
  const main = consistentMain.replace("win.webContents.send(DEMO_CHANNELS.changed, value);", "");
  assert.deepEqual(audit(main), ['契约 events.changed（"demo:changed"）在 main 中没有发送']);
});

test("fails when main registers or sends a channel outside the contract", () => {
  const main = `${consistentMain}\nhandle("demo:secret", () => 1);\nwin.webContents.send("demo:leak", 1);`;
  assert.deepEqual(audit(main), [
    'main 注册了契约之外的 channel "demo:secret"（main.ts）',
    'main 发送了契约之外的 channel "demo:leak"（main.ts）',
  ]);
});

test("fails when main uses a channel in the wrong direction", () => {
  const main = `${consistentMain}\nipcMain.on(DEMO_CHANNELS.changed, () => undefined);\nwin.webContents.send(DEMO_CHANNELS.ping, 1);`;
  assert.deepEqual(audit(main, consistentPreload, { registrarPath: "main.ts" }), [
    'main 注册了契约中的事件 events.changed（"demo:changed"），事件只能由 main 发送（main.ts）',
    'main 发送了契约中的 invoke 成员 demo.ping（"demo:ping"），只有事件由 main 发送（main.ts）',
  ]);
});

test("fails when a channel constant is not used by the contract", () => {
  const extra = [{ constant: "DEMO_CHANNELS", channels: new Map([...constants[0].channels, ["orphan", "demo:orphan"]]) }];
  assert.deepEqual(audit(consistentMain, consistentPreload, { constants: extra }), [
    '常量 DEMO_CHANNELS.orphan（"demo:orphan"）不在契约里',
  ]);
});

test("fails when preload does not build the bridge from the contract or references channels directly", () => {
  assert.deepEqual(audit(consistentMain, "const bridge = buildBridge(otherContract, transport, locals);"), [
    "preload 没有按 desktopBridgeContract 生成 bridge（buildBridge(desktopBridgeContract, …)）",
  ]);
  assert.deepEqual(audit(consistentMain, `${consistentPreload}\nipcRenderer.invoke(DEMO_CHANNELS.ping);\nipcRenderer.on("demo:changed", cb);`), [
    'preload 绕过契约直接引用了 channel "demo:ping"（preload.ts）',
    'preload 绕过契约直接引用了 channel "demo:changed"（preload.ts）',
  ]);
});

test("runCheck audits the tree it is given, with paths relative to that tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ipc-channels-"));
  try {
    const write = (relative, content) => {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), content);
    };
    const shared = "packages/util/shared/src";
    write(`${shared}/runtime-v2/fixed-renderer.ts`, 'export const RUNTIME_FIXED_RENDERER_CHANNELS = { ping: "fixed:ping" } as const;');
    write(`${shared}/resource-monitor.ts`, 'export const RESOURCE_MONITOR_CHANNELS = { watch: "monitor:watch" } as const;');
    write(`${shared}/english-learning.ts`, 'export const ENGLISH_LEARNING_CHANNELS = { lookup: "english:lookup" } as const;');
    write(`${shared}/host-protocol/connections.ts`, 'export const HOST_IPC = { changed: "host:changed" } as const;');
    write(
      `${shared}/desktop-bridge/contract.ts`,
      [
        "export const desktopBridgeContract = {",
        "  demo: {",
        "    ping: invoke<void, string>(RUNTIME_FIXED_RENDERER_CHANNELS.ping),",
        "    watch: invoke<boolean, void>(RESOURCE_MONITOR_CHANNELS.watch),",
        "    lookup: invoke<string, string>(ENGLISH_LEARNING_CHANNELS.lookup),",
        "  },",
        "  events: { changed: event<void>(HOST_IPC.changed) },",
        "} as const;",
      ].join("\n"),
    );
    // 注册器自己可以碰 ipcMain；它的路径要按传进来的根目录算，才认得出是注册器。
    write("apps/desktop/src/main/ipc/registry.ts", "export const ipc = { handle: (spec, fn) => ipcMain.handle(spec.channel, fn) };");
    write(
      "apps/desktop/src/main/index.ts",
      [
        'import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";',
        "ipc.handle(contract.demo.ping, ping);",
        "ipc.handle(contract.demo.watch, watch);",
        "ipc.handle(contract.demo.lookup, lookup);",
        "win.webContents.send(HOST_IPC.changed);",
      ].join("\n"),
    );
    write("apps/desktop/src/preload/index.ts", "const bridge = buildBridge(desktopBridgeContract, transport, locals);");
    const { contract: found, errors } = runCheck(root);
    assert.deepEqual(errors, []);
    assert.deepEqual([...found.keys()], ["demo.ping", "demo.watch", "demo.lookup", "events.changed"]);

    write("apps/desktop/src/main/windows/extra.ts", 'ipcMain.on("fixed:ping", () => undefined);');
    assert.deepEqual(runCheck(root).errors, [
      "main 绕过统一注册器直接调用了 ipcMain.on（apps/desktop/src/main/windows/extra.ts），请改用 ipc.on(contract.…)",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the repository passes the audit", () => {
  const { constants: repoConstants, contract: repoContract, errors } = runCheck();
  assert.deepEqual(errors, []);
  assert.ok(repoConstants.every(({ channels }) => channels.size > 0));
  assert.equal(repoContract.size, repoConstants.reduce((sum, { channels }) => sum + channels.size, 0));
});
