const path = require("node:path");
const { pathToFileURL } = require("node:url");

const runtimeEntry = path.resolve(
  __dirname,
  "../../../packages/core/runtime/dist/index.js",
);

let runtimePromise;

function loadRuntimeModule() {
  runtimePromise ??= import(pathToFileURL(runtimeEntry).href);
  return runtimePromise;
}

class RuntimeBridgeClient {
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
    this.transportPromise ??= loadRuntimeModule().then(
      ({ SocketBrowserBridgeTransport }) => new SocketBrowserBridgeTransport(this.options),
    );
    return this.transportPromise;
  }
}

module.exports = { RuntimeBridgeClient, loadRuntimeModule };
