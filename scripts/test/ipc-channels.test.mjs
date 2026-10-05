import assert from "node:assert/strict";
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

test("passes when main registers every invoke / send member and sends every event", () => {
  assert.deepEqual(audit(consistentMain), []);
});

test("accepts direct constant and string-literal registrations as well as the registrar", () => {
  const main = `
const channels = DEMO_CHANNELS;
handle(channels.ping, () => "pong");
ipcMain.on("demo:theme", () => undefined);
win.webContents.send(DEMO_CHANNELS.changed, value);
`;
  assert.deepEqual(audit(main), []);
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
  const main = `${consistentMain}\nipcMain.handle("demo:secret", () => 1);\nwin.webContents.send("demo:leak", 1);`;
  assert.deepEqual(audit(main), [
    'main 注册了契约之外的 channel "demo:secret"（main.ts）',
    'main 发送了契约之外的 channel "demo:leak"（main.ts）',
  ]);
});

test("fails when main uses a channel in the wrong direction", () => {
  const main = `${consistentMain}\nipcMain.on(DEMO_CHANNELS.changed, () => undefined);\nwin.webContents.send(DEMO_CHANNELS.ping, 1);`;
  assert.deepEqual(audit(main), [
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

test("the repository passes the audit", () => {
  const { constants: repoConstants, contract: repoContract, errors } = runCheck();
  assert.deepEqual(errors, []);
  assert.ok(repoConstants.every(({ channels }) => channels.size > 0));
  assert.equal(repoContract.size, repoConstants.reduce((sum, { channels }) => sum + channels.size, 0));
});
