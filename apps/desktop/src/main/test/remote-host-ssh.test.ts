// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, createConnection } from "node:net";
import { once } from "node:events";
import { openSshTunnel } from "../remote-hosts/ssh";
const exec = promisify(execFile);
it.skipIf(process.env.ACTSPACE_TEST_SSH !== "1")("forwards through an isolated real sshd and refuses unknown fingerprints", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-sshd-"));
  const echo = createServer(socket => socket.end("host-alive")); echo.listen(0, "127.0.0.1"); await once(echo, "listening"); const targetPort = (echo.address() as { port: number }).port;
  const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening"); const sshPort = (reserve.address() as { port: number }).port; await new Promise<void>(resolve => reserve.close(() => resolve()));
  let daemon: ReturnType<typeof spawn> | undefined; let tunnel: Awaited<ReturnType<typeof openSshTunnel>> | undefined;
  try {
    await exec("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(root, "host-key")]);
    await exec("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(root, "device-key")]);
    await writeFile(join(root, "authorized_keys"), await readFile(join(root, "device-key.pub")), { mode: 0o600 });
    await writeFile(join(root, "sshd_config"), `Port ${sshPort}\nListenAddress 127.0.0.1\nHostKey ${root}/host-key\nPidFile ${root}/sshd.pid\nAuthorizedKeysFile ${root}/authorized_keys\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nStrictModes yes\nAllowUsers ${userInfo().username}\nAllowTcpForwarding local\nPermitOpen 127.0.0.1:${targetPort}\n`);
    let error = ""; daemon = spawn("/usr/sbin/sshd", ["-D", "-e", "-f", join(root, "sshd_config")]); daemon.stderr!.on("data", bytes => { error += String(bytes); });
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 300); daemon!.once("exit", () => { clearTimeout(timer); reject(new Error(`Isolated sshd unavailable: ${error}`)); }); });
    const config = join(root, "ssh_config"); const known = join(root, "known_hosts");
    await writeFile(known, "", { mode: 0o600 });
    await writeFile(config, `Host fixture\n HostName 127.0.0.1\n Port ${sshPort}\n User ${userInfo().username}\n IdentityFile ${root}/device-key\n IdentitiesOnly yes\n UserKnownHostsFile ${known}\n GlobalKnownHostsFile /dev/null\n`);
    await expect(openSshTunnel("fixture", targetPort, config)).rejects.toThrow();
    const pub = (await readFile(join(root, "host-key.pub"), "utf8")).trim().split(" ").slice(0, 2).join(" ");
    await writeFile(known, `[127.0.0.1]:${sshPort} ${pub}\n`, { mode: 0o600 });
    tunnel = await openSshTunnel("fixture", targetPort, config);
    const output = await new Promise<string>((resolve, reject) => { const socket = createConnection(tunnel!.port, "127.0.0.1"); socket.once("data", bytes => { socket.destroy(); resolve(String(bytes)); }); socket.once("error", reject); });
    expect(output).toBe("host-alive"); await tunnel.close(); tunnel = undefined;
    expect(echo.listening).toBe(true);
    const differentKey = (await readFile(join(root, "device-key.pub"), "utf8")).trim().split(" ").slice(0, 2).join(" ");
    await writeFile(known, `[127.0.0.1]:${sshPort} ${differentKey}\n`, { mode: 0o600 });
    await expect(openSshTunnel("fixture", targetPort, config)).rejects.toThrow();
    await writeFile(known, `[127.0.0.1]:${sshPort} ${pub}\n`, { mode: 0o600 });
    const trustedConfig = await readFile(config, "utf8");
    await writeFile(config, `${trustedConfig} LocalForward 127.0.0.1:${targetPort} 127.0.0.1:${targetPort}\n`);
    await expect(openSshTunnel("fixture", targetPort, config)).rejects.toThrow(/forward|bind|Address already in use/i);
    expect(echo.listening).toBe(true);
    await writeFile(config, trustedConfig);
    await exec("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(root, "unauthorized-key")]);
    await writeFile(config, (await readFile(config, "utf8")).replace(`${root}/device-key`, `${root}/unauthorized-key`));
    await expect(openSshTunnel("fixture", targetPort, config)).rejects.toThrow();
  } finally {
    await tunnel?.close();
    if (daemon && daemon.exitCode === null) { const stopped = once(daemon, "exit"); daemon.kill("SIGTERM"); await stopped; }
    await new Promise<void>(resolve => echo.close(() => resolve())); await rm(root, { recursive: true, force: true });
  }
}, 20000);
