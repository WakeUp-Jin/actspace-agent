import assert from "node:assert/strict";
import test from "node:test";
import { auditIpcChannels, parseChannelConstant, runCheck } from "../check-ipc-channels.mjs";

const constantsSource = `
export const DEMO_CHANNELS = Object.freeze({
  ping: "demo:ping",
  changed: "demo:changed",
});
`;

const constants = [{ constant: "DEMO_CHANNELS", channels: parseChannelConstant(constantsSource, "DEMO_CHANNELS") }];

const consistentMain = `
const channels = DEMO_CHANNELS;
handle(channels.ping, () => "pong");
win.webContents.send(DEMO_CHANNELS.changed, value);
win.on("closed", () => undefined);
`;

const consistentPreload = `
ping: () => ipcRenderer.invoke(DEMO_CHANNELS.ping),
onChanged: (cb) => ipcRenderer.on("demo:changed", cb),
`;

const audit = (main, preload) => auditIpcChannels({
  constants,
  mainSources: [{ path: "main.ts", text: main }],
  preloadSources: [{ path: "preload.ts", text: preload }],
});

test("parses channel constants, with or without Object.freeze", () => {
  assert.deepEqual([...constants[0].channels], [["ping", "demo:ping"], ["changed", "demo:changed"]]);
  assert.deepEqual(
    [...parseChannelConstant('export const X = { a: "x:a" } as const;', "X")],
    [["a", "x:a"]],
  );
});

test("passes when constants, main and preload agree (aliases and string values count)", () => {
  assert.deepEqual(audit(consistentMain, consistentPreload), []);
});

test("fails when a constant is neither registered nor sent in main", () => {
  const main = consistentMain.replace('handle(channels.ping, () => "pong");', "");
  assert.deepEqual(audit(main, consistentPreload), [
    'DEMO_CHANNELS.ping（"demo:ping"）在 main 中没有注册，也没有发送',
  ]);
});

test("fails when main registers a channel that preload never references", () => {
  const preload = consistentPreload.replace("ping: () => ipcRenderer.invoke(DEMO_CHANNELS.ping),", "");
  assert.deepEqual(audit(consistentMain, preload), [
    'DEMO_CHANNELS.ping（"demo:ping"）在 main 中注册了，但 preload 没有引用',
  ]);
});

test("fails when main registers or sends a literal channel outside the constants", () => {
  const main = `${consistentMain}\nipcMain.handle("demo:secret", () => 1);\nwin.webContents.send("demo:leak", 1);`;
  assert.deepEqual(audit(main, consistentPreload), [
    'main 注册了常量表之外的 channel "demo:secret"（main.ts）',
    'main 发送了常量表之外的 channel "demo:leak"（main.ts）',
  ]);
});

test("the repository passes the audit", () => {
  const { constants: repoConstants, errors } = runCheck();
  assert.deepEqual(errors, []);
  assert.ok(repoConstants.every(({ channels }) => channels.size > 0));
});
