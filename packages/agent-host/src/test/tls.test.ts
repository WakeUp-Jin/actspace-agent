import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { HostAuth } from "../auth.js";
import { HostGateway } from "../server.js";
it("uses a real TLS handshake and refuses untrusted certificates and foreign Origins", async () => {
  const root = await mkdtemp(join(tmpdir(), "host-tls-")); let gateway: HostGateway | undefined;
  try {
    await promisify(execFile)("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(root, "key.pem"), "-out", join(root, "cert.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost"]);
    const cert = await readFile(join(root, "cert.pem"), "utf8"); const key = await readFile(join(root, "key.pem"), "utf8");
    const auth = new HostAuth(root); await auth.open();
    gateway = new HostGateway({ auth, port: 0, tls: { cert, key }, allowedOrigins: ["https://allowed.example"], state: () => "ready", dispatch: async () => null });
    const port = await gateway.listen();
    const connect = (options: WebSocket.ClientOptions = {}) => new Promise<WebSocket>((resolve, reject) => { const socket = new WebSocket(`wss://127.0.0.1:${port}/rpc`, options); socket.once("open", () => resolve(socket)); socket.once("error", reject); });
    await expect(connect()).rejects.toThrow();
    await expect(connect({ ca: cert, origin: "https://foreign.example" })).rejects.toThrow("403");
    const socket = await connect({ ca: cert, origin: "https://allowed.example" }); socket.terminate();
  } finally { await gateway?.close(); await rm(root, { recursive: true, force: true }); }
});
