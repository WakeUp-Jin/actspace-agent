const path = require("node:path");
const { pathToFileURL } = require("node:url");

const runtimeEntry = path.resolve(
  __dirname,
  "../../../../packages/agent-runtime/dist/index.js",
);

let runtimePromise;

function loadRuntimeV2() {
  runtimePromise ??= import(pathToFileURL(runtimeEntry).href);
  return runtimePromise;
}

class RuntimeV2BridgeClient {
  constructor(options) {
    this.options = options;
    this.transportPromise = undefined;
  }

  async send(method, params, signal) {
    const transport = await this.#transport();
    return transport.request(method, params, signal);
  }

  async dispose() {
    if (this.transportPromise === undefined) return;
    const transport = await this.transportPromise;
    await transport.dispose();
  }

  #transport() {
    this.transportPromise ??= loadRuntimeV2().then(
      ({ SocketBrowserBridgeTransport }) => new SocketBrowserBridgeTransport(this.options),
    );
    return this.transportPromise;
  }
}

module.exports = { RuntimeV2BridgeClient, loadRuntimeV2 };
