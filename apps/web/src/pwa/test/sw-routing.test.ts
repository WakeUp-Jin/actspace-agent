import { routeRequest } from "../sw-routing";

const origin = "https://a.test";
const route = (path: string, mode: RequestMode = "no-cors", method = "GET", base = origin) => routeRequest(new URL(path, base), mode, method, origin);

describe("routeRequest", () => {
  it("bypasses /rpc, cross-origin and non-GET", () => {
    expect(route("/rpc", "cors")).toBe("bypass");
    expect(route("/rpc/x")).toBe("bypass");
    expect(route("/assets/x.js", "no-cors", "GET", "https://cdn.test")).toBe("bypass");
    expect(route("/", "navigate", "POST")).toBe("bypass");
  });
  it("network-first for navigation, cache-first for assets", () => {
    expect(route("/sessions/1", "navigate")).toBe("network-first");
    expect(route("/assets/x.js")).toBe("cache-first");
  });
  it("bypasses everything else", () => {
    expect(route("/manifest.webmanifest")).toBe("bypass");
    expect(route("/icons/icon-192.png")).toBe("bypass");
    expect(route("/sw.js")).toBe("bypass");
  });
});
