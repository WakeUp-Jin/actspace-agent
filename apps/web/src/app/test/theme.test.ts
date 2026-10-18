import { applyTheme, readTheme, resolveTheme, setTheme } from "../theme";

it("persists explicit themes and treats system as the default", () => {
  expect(readTheme()).toBe("system");
  setTheme("dark");
  expect(readTheme()).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  setTheme("system");
  expect(localStorage.getItem("actspace.web.theme")).toBeNull();
  expect(document.documentElement.dataset.theme).toBe("system");
});

it("resolves system mode from the OS preference", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
});

it("points both theme-color metas at the chosen theme", () => {
  document.head.innerHTML = '<meta name="theme-color" content="#f7f7f5" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#181916" media="(prefers-color-scheme: dark)">';
  applyTheme("dark");
  expect([...document.querySelectorAll('meta[name="theme-color"]')].map(meta => meta.getAttribute("content"))).toEqual(["#181916", "#181916"]);
  applyTheme("system");
  expect([...document.querySelectorAll('meta[name="theme-color"]')].map(meta => meta.getAttribute("content"))).toEqual(["#f7f7f5", "#181916"]);
});
