import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extensionLayerDigest, parsePythonRuntimeManifest, type PythonRuntime } from "@actspace/python-runtime";
import { PythonRuntimeService, resolveDesktopPythonRuntime } from "../python-runtime/python-runtime-service";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

/** The smallest zip Python's `zipfile` would accept: one stored entry plus its central directory. */
function wheelBytes(path: string, body: string): Buffer {
  const name = Buffer.from(path);
  const data = Buffer.from(body);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
  local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10);
  central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42);
  const centralOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(centralOffset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([local, name, data, central, name, end]);
}

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function fakeRuntime(root: string, wheel: Buffer): PythonRuntime {
  const pin = { name: "numpy", version: "2.0", file: "numpy-2.0-py3-none-any.whl", url: "https://files.example/numpy-2.0-py3-none-any.whl", sha256: createHash("sha256").update(wheel).digest("hex") };
  const manifest = parsePythonRuntimeManifest({
    schemaVersion: 1, target: "linux-x64", python: { version: "3.12.16", release: "20261026" },
    executable: "bin/python3.12", sitePackages: "lib/python3.12/site-packages", shimDirectory: "shim",
    core: [{ name: "openpyxl", version: "3.1.5" }, { name: "pypdf", version: "6.0" }],
    extension: { digest: extensionLayerDigest([pin]), packages: ["numpy", "pandas"], wheels: [pin] },
  });
  return { root, manifest, executable: join(root, "bin", "python3.12"), sitePackages: join(root, "lib", "python3.12", "site-packages"), shimDirectory: join(root, "shim"), shim: join(root, "shim", "actspace-python") };
}

describe("PythonRuntimeService", () => {
  it("reports no runtime and still answers the settings page when the build ships none", () => {
    const service = new PythonRuntimeService({ runtime: undefined, dataRoot: "/data" });
    expect(service.forBash()).toBeUndefined();
    expect(service.getStatus()).toEqual({ runtime: null, extension: { packages: [], state: "missing", localWheelsDirectory: join("/data", "runtime", "python-ext", "wheels") } });
    expect(service.installExtension().extension.state).toBe("missing");
  });

  it("installs the extension once and makes it visible to the next bash command without a restart", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "py-svc-"));
    roots.push(dataRoot);
    const wheel = wheelBytes("numpy/__init__.py", "ok\n");
    const runtime = fakeRuntime("/app/runtime/python", wheel);
    let calls = 0;
    const fetchStub = (async () => { calls++; return new Response(wheel); }) as typeof fetch;
    const service = new PythonRuntimeService({ runtime, dataRoot, fetch: fetchStub });
    const bash = service.forBash()!;
    expect(bash.shim).toBe(join("/app/runtime/python", "shim", "actspace-python"));
    expect(bash.corePackages).toEqual(["openpyxl", "pypdf"]);
    expect(bash.extensionSitePackages()).toBeUndefined();
    expect(service.getStatus().extension.state).toBe("missing");

    expect(service.installExtension().extension.state).toBe("installing");
    expect(service.installExtension().extension.state).toBe("installing");
    await service.settle();
    expect(calls).toBe(1);
    const status = service.getStatus();
    expect(status.extension.state).toBe("ready");
    expect(status.runtime?.version).toBe("3.12.16");
    const sitePackages = join(dataRoot, "runtime", "python-ext", runtime.manifest.extension.digest, "site-packages");
    expect(bash.extensionSitePackages()).toBe(sitePackages);
    expect(service.installExtension().extension.state).toBe("ready");
    expect(calls).toBe(1);
  });

  it("keeps the failure reason until the next attempt", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "py-svc-"));
    roots.push(dataRoot);
    const runtime = fakeRuntime("/app/runtime/python", wheelBytes("numpy/__init__.py", "ok\n"));
    const fetchStub = (async () => { throw new Error("offline"); }) as typeof fetch;
    const service = new PythonRuntimeService({ runtime, dataRoot, fetch: fetchStub });
    service.installExtension();
    await service.settle();
    const status = service.getStatus();
    expect(status.extension.state).toBe("failed");
    expect(status.extension.error).toContain("offline");
    expect(service.forBash()!.extensionSitePackages()).toBeUndefined();
  });

  it("only trusts the bundled runtime when packaged", () => {
    expect(resolveDesktopPythonRuntime({ packaged: true, resourcesPath: "/nowhere", repoRoot: "/repo", env: { ACTSPACE_PYTHON_RUNTIME: "/also-nowhere" } })).toBeUndefined();
    expect(resolveDesktopPythonRuntime({ packaged: false, resourcesPath: "/nowhere", repoRoot: "/repo", env: {} })).toBeUndefined();
  });
});
