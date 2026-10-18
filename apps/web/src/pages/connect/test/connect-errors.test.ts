import { describeConnectError, revokedMessage } from "../connect-errors";

it("maps an invalid pair code onto the code field", () => {
  expect(describeConnectError({ kind: "UNAUTHENTICATED", message: "x" })).toEqual({ field: "code", message: "配对码无效或已过期，请在服务器上重新生成" });
});
it("maps rate limiting", () => {
  expect(describeConnectError({ kind: "LIMIT_EXCEEDED", message: "x" }).message).toBe("尝试太频繁，请一分钟后再试");
});
it("maps unreachable hosts and names the address", () => {
  const result = describeConnectError({ message: "WebSocket error", closeCode: 1006, url: "https://a.example" });
  expect(result.field).toBe("url");
  expect(result.message).toContain("连不上 https://a.example");
  expect(result.message).toContain("allowedOrigins");
});
it("maps revoked devices by kind or close code", () => {
  expect(describeConnectError({ kind: "REVOKED", message: "x" }).message).toContain("已在服务器上被移除");
  expect(describeConnectError({ closeCode: 4003, message: "x" }).message).toContain("已在服务器上被移除");
  expect(revokedMessage("unauthenticated")).toBe("登录已失效，请重新配对");
  expect(revokedMessage(null)).toBeNull();
});
it("treats a malformed address as a url error", () => {
  expect(describeConnectError(new TypeError("Invalid URL")).field).toBe("url");
});
