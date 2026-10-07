import assert from "node:assert/strict";
import test from "node:test";
import {
  auditRendererBridgeAccess,
  findBridgeAccesses,
  findBridgeImports,
  isAllowedPath,
  isBridgeImportAllowed,
  runCheck,
} from "../check-renderer-bridge-access.mjs";

test("allows main.tsx, api/bridge.ts, mock/** and test/** only", () => {
  for (const file of ["main.tsx", "api/bridge.ts", "mock/handlers.ts", "mock/scenarios/long-session.ts", "test/helpers/bridge.ts"]) {
    assert.equal(isAllowedPath(file), true, file);
  }
  for (const file of ["App.tsx", "api/sessions.ts", "components/main.tsx", "components/mock/x.ts", "hooks/test.ts"]) {
    assert.equal(isAllowedPath(file), false, file);
  }
});

test("finds member, optional, cast, bracket and destructuring access", () => {
  const source = [
    "const a = window.actspace.sessions.list();",
    "const b = window.actspace?.settings;",
    "const c = (window as unknown as { actspace: X }).actspace;",
    "const d = window?.actspaceHosts;",
    'const e = window["actspace"];',
    "const { actspaceHosts } = window;",
  ].join("\n");
  assert.deepEqual(findBridgeAccesses(source), [
    { line: 1, name: "actspace" },
    { line: 2, name: "actspace" },
    { line: 3, name: "actspace" },
    { line: 4, name: "actspaceHosts" },
    { line: 5, name: "actspace" },
    { line: 6, name: "actspaceHosts" },
  ]);
});

test("ignores api imports, package names, paths and storage keys", () => {
  const source = [
    'import { sessionsApi } from "../api/sessions";',
    'import type { X } from "@actspace/shared";',
    'const file = "~/.actspace/settings.json";',
    'localStorage.getItem("actspace:remote-models");',
    'document.documentElement.classList.add("actspace-theme");',
  ].join("\n");
  assert.deepEqual(findBridgeAccesses(source), []);
});

test("reports each direct access outside the allowed files", () => {
  const errors = auditRendererBridgeAccess([
    { path: "App.tsx", text: "\nawait window.actspace.sessions.list();" },
    { path: "hooks/useRemoteTarget.ts", text: "window.actspaceHosts?.activate(id);" },
    { path: "api/bridge.ts", text: "return window.actspace;" },
    { path: "test/x.test.ts", text: "window.actspaceHosts = hosts;" },
  ]);
  assert.deepEqual(errors, [
    "apps/desktop/src/renderer/App.tsx:2 直接访问了 actspace，请改用 api/<域>",
    "apps/desktop/src/renderer/hooks/useRemoteTarget.ts:1 直接访问了 actspaceHosts，请改用 api/<域>",
  ]);
});

test("only api/**, main.tsx, bridge-bootstrap.ts, mock/** and test/** may import api/bridge", () => {
  for (const file of ["api/hosts.ts", "main.tsx", "bridge-bootstrap.ts", "mock/install-mock-bridge.ts", "test/helpers/bridge.ts"]) {
    assert.equal(isBridgeImportAllowed(file), true, file);
  }
  for (const file of ["App.tsx", "components/Composer.tsx", "hooks/api/bridge.ts"]) {
    assert.equal(isBridgeImportAllowed(file), false, file);
  }
  const source = [
    'import { getBridge } from "../api/bridge";',
    'import { hostsApi } from "../api/hosts";',
    'const { getBridge: g } = await import("../../api/bridge.ts");',
    'import "./api/bridge";',
    'import { x } from "../api/bridge-utils";',
  ].join("\n");
  assert.deepEqual(findBridgeImports(source), [1, 3, 4]);
  assert.deepEqual(auditRendererBridgeAccess([
    { path: "components/Composer.tsx", text: 'import { getBridge } from "../api/bridge";' },
    { path: "api/hosts.ts", text: 'import { domainApi } from "./bridge";' },
    { path: "main.tsx", text: 'import { hasPreloadBridge } from "./api/bridge";' },
  ]), ["apps/desktop/src/renderer/components/Composer.tsx:1 导入了 api/bridge，请改用 api/<域>"]);
});

test("the repository renderer passes", () => {
  const { files, errors } = runCheck();
  assert.ok(files > 0);
  assert.deepEqual(errors, []);
});
