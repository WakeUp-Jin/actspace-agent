import { formatRoute, parseRoute, type Route } from "../router";

it("round-trips every route", () => {
  const routes: Route[] = [{ name: "home" }, { name: "connect" }, { name: "settings" }, { name: "session", sessionId: "s 1/é" }];
  for (const route of routes) expect(parseRoute(formatRoute(route))).toEqual(route);
});

it("falls back to home for unknown or malformed paths", () => {
  expect(parseRoute("/nope")).toEqual({ name: "home" });
  expect(parseRoute("/sessions/a/b")).toEqual({ name: "home" });
  expect(parseRoute("/sessions/%E0%A4%A")).toEqual({ name: "home" });
  expect(parseRoute("/settings/")).toEqual({ name: "settings" });
});
