import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extensionLayerDigest, installExtensionLayer, installedExtensionSitePackages, EXTENSION_LAYER_LOCAL_WHEELS } from "../extension.js";
import { findBundledPythonRuntime, loadPythonRuntime, repoPythonRuntimePath } from "../locate.js";
import { parsePythonRuntimeManifest, pythonRuntimeTarget, type PythonRuntimeManifest } from "../runtime-manifest.js";
import { installPath, installWheel } from "../wheel.js";
import { readZipEntries } from "../zip.js";
import { buildZip } from "./zip-fixture.js";

const roots: string[] = [];
async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "python-runtime-"));
  roots.push(root);
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function manifestFor(wheels: readonly { file: string; bytes: Buffer }[], target = pythonRuntimeTarget() ?? "linux-x64"): PythonRuntimeManifest {
  const pinned = wheels.map((wheel, index) => ({ name: `pkg${index}`, version: "1.0", file: wheel.file, url: `https://files.example/${wheel.file}`, sha256: sha256(wheel.bytes) }));
  return parsePythonRuntimeManifest({
    schemaVersion: 1, target, python: { version: "3.12.16", release: "20261026" },
    executable: target === "win-x64" ? "python.exe" : "bin/python3.12", sitePackages: "lib/python3.12/site-packages", shimDirectory: "shim",
    core: [{ name: "openpyxl", version: "3.1.5" }],
    extension: { digest: extensionLayerDigest(pinned), packages: ["numpy"], wheels: pinned },
  });
}

describe("manifest", () => {
  it("accepts the shape prepare.mjs writes and rejects tampered fields", () => {
    const manifest = manifestFor([]);
    expect(manifest.core).toEqual([{ name: "openpyxl", version: "3.1.5" }]);
    expect(() => parsePythonRuntimeManifest({ ...manifest, executable: "../bin/python" })).toThrow(/relative path/);
    expect(() => parsePythonRuntimeManifest({ ...manifest, extension: { ...manifest.extension, wheels: [{ name: "x", version: "1", file: "x.whl", url: "http://insecure/x.whl", sha256: "a".repeat(64) }] } })).toThrow(/https/);
    expect(() => parsePythonRuntimeManifest({ ...manifest, extension: { ...manifest.extension, wheels: [{ name: "x", version: "1", file: "x.whl", url: "https://ok/x.whl", sha256: "zz" }] } })).toThrow(/sha256/);
    expect(() => parsePythonRuntimeManifest({ ...manifest, target: "freebsd" })).toThrow(/unknown target/);
  });

  it("maps machines to targets", () => {
    expect(pythonRuntimeTarget("darwin", "arm64")).toBe("mac-arm64");
    expect(pythonRuntimeTarget("linux", "x64")).toBe("linux-x64");
    expect(pythonRuntimeTarget("win32", "x64")).toBe("win-x64");
    expect(pythonRuntimeTarget("win32", "arm64")).toBeUndefined();
    expect(repoPythonRuntimePath("/repo", "darwin", "x64")).toBe(join("/repo", "dist", "python-runtime", "mac-x64"));
  });
});

describe("locate", () => {
  it("loads a runtime whose manifest, interpreter and shim are in place, and skips anything else", async () => {
    const root = await scratch();
    const manifest = manifestFor([]);
    expect(loadPythonRuntime(root)).toBeUndefined();
    await writeFile(join(root, "runtime.json"), JSON.stringify(manifest));
    expect(loadPythonRuntime(root)).toBeUndefined();
    await mkdir(join(root, "bin"), { recursive: true });
    await mkdir(join(root, "shim"), { recursive: true });
    await writeFile(join(root, "bin", "python3.12"), "#!/bin/sh\n", { mode: 0o755 });
    await writeFile(join(root, "shim", "actspace-python"), "#!/bin/sh\n", { mode: 0o755 });
    const runtime = loadPythonRuntime(root, "linux", "x64");
    if (process.platform === "win32") return;
    expect(runtime?.shim).toBe(join(root, "shim", "actspace-python"));
    expect(runtime?.sitePackages).toBe(join(root, "lib", "python3.12", "site-packages"));
    expect(loadPythonRuntime(root, "darwin", "arm64")).toBeUndefined();
    expect(findBundledPythonRuntime([undefined, join(root, "missing"), root])?.root).toBe(root);
  });
});

describe("zip and wheel", () => {
  it("reads stored and deflated entries with their modes", () => {
    const archive = buildZip([{ name: "a.txt", data: "hello" }, { name: "b/c.py", data: "print(1)\n".repeat(50), deflate: true, mode: 0o755 }, { name: "d/" }]);
    const entries = readZipEntries(archive);
    expect(entries.map((entry) => entry.name)).toEqual(["a.txt", "b/c.py", "d/"]);
    expect(entries[0]!.read().toString()).toBe("hello");
    expect(entries[1]!.read().toString()).toBe("print(1)\n".repeat(50));
    expect(entries[1]!.mode).toBe(0o755);
    expect(entries[2]!.directory).toBe(true);
    expect(() => readZipEntries(Buffer.from("not a zip"))).toThrow(/end-of-central-directory/);
  });

  it("folds .data/purelib into site-packages, drops scripts, tests and bytecode, and refuses escapes", () => {
    expect(installPath("numpy/__init__.py")).toBe("numpy/__init__.py");
    expect(installPath("pkg-1.0.data/purelib/pkg/mod.py")).toBe("pkg/mod.py");
    expect(installPath("pkg-1.0.data/platlib/pkg/_ext.so")).toBe("pkg/_ext.so");
    expect(installPath("pkg-1.0.data/scripts/tool")).toBeUndefined();
    expect(installPath("pandas/tests/test_x.py")).toBeUndefined();
    expect(installPath("pkg/__pycache__/mod.cpython-312.pyc")).toBeUndefined();
    expect(() => installPath("../evil.py")).toThrow(/escapes/);
    expect(() => installPath("/abs.py")).toThrow(/unsafe/);
  });

  it("installs a wheel's files with executable bits where recorded", async () => {
    const root = await scratch();
    const wheel = buildZip([
      { name: "pkg/__init__.py", data: "x = 1\n" },
      { name: "pkg/bin.so", data: "elf", mode: 0o755 },
      { name: "pkg/tests/test_x.py", data: "" },
      { name: "pkg-1.0.dist-info/METADATA", data: "Name: pkg\n", deflate: true },
      { name: "pkg-1.0.data/scripts/pkg-cli", data: "#!python\n" },
    ]);
    expect(installWheel(wheel, root)).toBe(3);
    expect(readFileSync(join(root, "pkg", "__init__.py"), "utf8")).toBe("x = 1\n");
    expect(existsSync(join(root, "pkg", "tests"))).toBe(false);
    expect(existsSync(join(root, "pkg-1.0.data"))).toBe(false);
    if (process.platform !== "win32") expect(statSync(join(root, "pkg", "bin.so")).mode & 0o111).not.toBe(0);
  });
});

describe("extension layer", () => {
  it("downloads pinned wheels, verifies them, installs under the digest and reports the layer as installed", async () => {
    const dataRoot = await scratch();
    const good = buildZip([{ name: "numpy/__init__.py", data: "version = '2'\n" }]);
    const manifest = manifestFor([{ file: "numpy-2.0-py3-none-any.whl", bytes: good }]);
    expect(installedExtensionSitePackages(dataRoot, manifest)).toBeUndefined();
    const progress: number[] = [];
    const fetched: string[] = [];
    const fetchStub = (async (url: string | URL | Request) => { fetched.push(String(url)); return new Response(good); }) as typeof fetch;
    const sitePackages = await installExtensionLayer({ manifest, dataRoot, fetch: fetchStub, onProgress: (item) => progress.push(item.completed) });
    expect(fetched).toEqual(["https://files.example/numpy-2.0-py3-none-any.whl"]);
    expect(progress).toEqual([0, 1]);
    expect(sitePackages).toBe(join(dataRoot, "runtime", "python-ext", manifest.extension.digest, "site-packages"));
    expect(readFileSync(join(sitePackages, "numpy", "__init__.py"), "utf8")).toBe("version = '2'\n");
    expect(installedExtensionSitePackages(dataRoot, manifest)).toBe(sitePackages);
    expect(await readdir(join(dataRoot, "runtime", "python-ext"))).toEqual([manifest.extension.digest]);
  });

  it("rejects a wheel whose bytes do not match the pin and leaves no partial layer behind", async () => {
    const dataRoot = await scratch();
    const good = buildZip([{ name: "numpy/__init__.py", data: "ok" }]);
    const manifest = manifestFor([{ file: "numpy-2.0-py3-none-any.whl", bytes: good }]);
    const fetchStub = (async () => new Response(buildZip([{ name: "numpy/__init__.py", data: "tampered" }]))) as typeof fetch;
    await expect(installExtensionLayer({ manifest, dataRoot, fetch: fetchStub })).rejects.toThrow(/does not match its pinned sha256/);
    expect(await readdir(join(dataRoot, "runtime", "python-ext"))).toEqual([]);
    expect(installedExtensionSitePackages(dataRoot, manifest)).toBeUndefined();
  });

  it("prefers a hand-placed wheel with the right digest and removes layers of other digests", async () => {
    const dataRoot = await scratch();
    const good = buildZip([{ name: "numpy/__init__.py", data: "offline" }]);
    const manifest = manifestFor([{ file: "numpy-2.0-py3-none-any.whl", bytes: good }]);
    const extRoot = join(dataRoot, "runtime", "python-ext");
    await mkdir(join(extRoot, EXTENSION_LAYER_LOCAL_WHEELS), { recursive: true });
    await writeFile(join(extRoot, EXTENSION_LAYER_LOCAL_WHEELS, "numpy-2.0-py3-none-any.whl"), good);
    await mkdir(join(extRoot, "0123456789abcdef", "site-packages"), { recursive: true });
    const fetchStub = (async () => { throw new Error("offline"); }) as typeof fetch;
    const sitePackages = await installExtensionLayer({ manifest, dataRoot, fetch: fetchStub });
    expect(readFileSync(join(sitePackages, "numpy", "__init__.py"), "utf8")).toBe("offline");
    expect((await readdir(extRoot)).sort()).toEqual([manifest.extension.digest, EXTENSION_LAYER_LOCAL_WHEELS].sort());
  });
});
