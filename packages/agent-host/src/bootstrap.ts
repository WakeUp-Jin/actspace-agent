import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { containNotification } from "@actspace/cordis-adapter";
import { HostError } from "@actspace/shared/host-protocol";
import { HostAdmin, type AdminRequest } from "./admin.js";
import { HostAuth } from "./auth.js";
import { HostApprovalBroker } from "./approval.js";
import { HostArtifacts } from "./artifacts.js";
import type { HostConfig } from "./config.js";
import { HostLifecycle, startUploadMaintenance, type HostRuntime } from "./lifecycle.js";
import { HostLiveOutput } from "./live-output.js";
import { NodeArtifactStore } from "./node-ports/artifact-store.js";
import { HostObservations } from "./observation.js";
import { HostRpc } from "./rpc.js";
import { HostGateway } from "./server.js";
import { HostUploads } from "./uploads.js";

export interface HostRuntimeInput {
  readonly artifacts: NodeArtifactStore;
  readonly approvals: HostApprovalBroker;
  readonly readArtifact: NodeArtifactStore["readForSession"];
  readonly resolveArtifact: NodeArtifactStore["resolveForSession"];
  readonly onLiveEvent: (event: { readonly sessionId: string; readonly kind: string }) => void;
}

/** Transport resources belong to Host; the injected callback owns Runtime assembly. */
export async function bootstrapHost(config: HostConfig, options: {
  bootRuntime(input: HostRuntimeInput): Promise<HostRuntime>;
  forceExit?: () => void;
  log(message: string): void;
}) {
  const releases: (() => unknown | Promise<unknown>)[] = [];
  const own = (release: () => unknown | Promise<unknown>) => {
    let result: Promise<unknown> | undefined;
    const once = () => result ??= Promise.resolve().then(release);
    releases.push(once);
    return once;
  };
  const releaseAll = async () => {
    const errors: unknown[] = [];
    for (const release of releases.slice().reverse()) {
      try { await release(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Host resource cleanup failed");
  };
  let adminDispatch: (request: AdminRequest) => Promise<unknown> = async () => ({ state: "starting" });
  const admin = new HostAdmin(config.dataRoot, request => adminDispatch(request));
  // A failed open does not own a foreign admin lock.
  await admin.open();
  own(() => admin.close());
  try {
    const artifacts = new NodeArtifactStore(config.dataRoot);
    own(() => artifacts.dispose());
    const approvals = new HostApprovalBroker();
    const auth = new HostAuth(join(config.dataRoot, "host-auth"), Date.now, () => admin.assertOwned());
    await auth.open();
    const uploads = new HostUploads(join(config.dataRoot, "host-uploads"));
    await uploads.cleanup();
    const readArtifact: HostRuntimeInput["readArtifact"] = async (sessionId, artifactId) => {
      try { return await uploads.readForSession(sessionId, artifactId); }
      catch (error) { if (!(error instanceof HostError) || error.kind !== "NOT_FOUND") throw error; return artifacts.readForSession(sessionId, artifactId); }
    };
    const resolveArtifact: HostRuntimeInput["resolveArtifact"] = async (sessionId, artifactId) => {
      try { return await uploads.resolve(sessionId, artifactId); }
      catch (error) { if (!(error instanceof HostError) || error.kind !== "NOT_FOUND") throw error; return artifacts.resolveForSession(sessionId, artifactId); }
    };
    let lifecycle: HostLifecycle | undefined;
    let rpc: HostRpc | undefined;
    const gateway = new HostGateway({ auth, address: config.listen.address, port: config.listen.port,
      ...(config.tls ? { tls: { cert: await readFile(config.tls.cert, "utf8"), key: await readFile(config.tls.key, "utf8") } } : {}),
      allowedOrigins: config.allowedOrigins, ...(config.webRoot ? { webRoot: config.webRoot } : {}), state: () => lifecycle?.state() ?? "blocked",
      dispatch: async (method, params, context) => {
        await admin.assertOwned();
        if (!rpc) throw new Error("Host starting");
        return rpc.dispatch(method, params, context);
      },
    });
    own(() => gateway.close());
    const output = new HostLiveOutput();
    const observations = new HostObservations(gateway.epoch);
    own(() => observations.dispose());
    const runtime = await options.bootRuntime({ artifacts, approvals, readArtifact, resolveArtifact,
      onLiveEvent: event => { output.accept(event); observations.publish(event.sessionId, { kind: "live", event }); },
    });
    const shutdown = own(() => runtime.shutdown());
    let stopMaintenance = async () => {};
    lifecycle = new HostLifecycle(runtime, {
      shutdown,
      beforeShutdown: () => stopMaintenance(), close: releaseAll,
      onState: state => observations.publish("host", { kind: "state", state }), forceExit: options.forceExit,
    });
    const { application } = runtime;
    // Session lists observe the host topic only; run state is otherwise published per session.
    const running = new Set<string>();
    rpc = new HostRpc({ application, config, approvals, observations, uploads, output, artifacts: new HostArtifacts(uploads, artifacts), state: () => lifecycle!.state(), runningSessions: () => [...running] });
    own(runtime.subscribeTasks(containNotification({ logger: { error: (_message, error) => options.log(`Task notification observer failed: ${String(error)}`) } }, snapshot => {
      for (const run of snapshot.runs) if (run.state !== "running") output.clear(snapshot.sessionId, run.runId);
      observations.publish(snapshot.sessionId, { kind: "tasks", snapshot });
      const active = snapshot.runs.some(run => run.state === "running");
      if (active !== running.has(snapshot.sessionId)) {
        if (active) running.add(snapshot.sessionId); else running.delete(snapshot.sessionId);
        observations.publish("host", { kind: "activity", sessionId: snapshot.sessionId, running: active });
      }
      observations.publish("host", { kind: "sessions-changed" });
    })));
    own(application.subscribeSessionProjection(update => {
      observations.publish(update.sessionId, { kind: "projection", update });
      observations.publish("host", { kind: "sessions-changed" });
    }));
    own(approvals.subscribe((sessionId, settled) => {
      const value = { kind: "approvals", sessionId, requests: approvals.list(sessionId), ...(settled ? { settled } : {}) };
      observations.publish(sessionId, value); observations.publish("host", value);
    }));
    if (lifecycle.state() === "ready") await uploads.reconcilePins(async (sessionId, submissionId) => {
      const snapshot = (await application.taskCommand({ sessionId, op: "snapshot" })).snapshot;
      return snapshot.tasks.some(task => task.submissionId === submissionId);
    });
    const port = await gateway.listen();
    stopMaintenance = startUploadMaintenance(() => uploads.cleanup(), () => {
      lifecycle!.block();
      options.log("Host upload maintenance failed; inspect storage and restart.");
    });
    own(stopMaintenance);
    const stopTimers = new Set<ReturnType<typeof setTimeout>>();
    own(() => { for (const timer of stopTimers) clearTimeout(timer); });
    const handle = { auth, port, hostId: auth.hostId, application, state: () => lifecycle!.state(), stop: (force = false) => lifecycle!.stop(force) };
    adminDispatch = async request => {
      switch (request.command) {
        case "status": return { hostId: auth.hostId, state: lifecycle!.state(), port, approvals: approvals.list().length, ...await lifecycle!.diagnostics() };
        case "pair": return auth.createPairCode();
        case "devices": return auth.list();
        case "revoke": if (!request.deviceId) throw new Error("deviceId required"); await auth.revoke(request.deviceId); return { revoked: true };
        case "stop": {
          const timer = setTimeout(() => {
            stopTimers.delete(timer);
            void handle.stop(request.force).catch(error => options.log(`Host shutdown failed: ${String(error)}`));
          }, 200);
          stopTimers.add(timer);
          return { state: "draining", force: request.force === true };
        }
      }
    };
    admin.start();
    return handle;
  } catch (error) {
    try { await releaseAll(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Host startup failed", { cause: error }); }
    throw error;
  }
}
