import { activeSavedHost, clearHostToken, defaultDeviceName, readSavedHosts, removeHost, saveHost } from "../saved-hosts";

const host = { hostId: "h1", deviceId: "d1", url: "https://a.example", token: "t", name: "n", pairedAt: "2026-10-17T00:00:00.000Z" };

it("round-trips, clears the token and removes the host", () => {
  saveHost(host);
  expect(activeSavedHost()).toEqual(host);
  clearHostToken("h1");
  expect(activeSavedHost()?.token).toBe("");
  removeHost("h1");
  expect(readSavedHosts()).toBeNull();
});

it("ignores malformed storage", () => {
  localStorage.setItem("actspace.web.hosts", JSON.stringify({ version: 2, hosts: [] }));
  expect(readSavedHosts()).toBeNull();
  localStorage.setItem("actspace.web.hosts", "{not json");
  expect(activeSavedHost()).toBeNull();
});

it("derives a readable device name", () => {
  expect(defaultDeviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari · iPhone");
  expect(defaultDeviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe("Chrome · Mac");
});
