import { expect, it } from "vitest";
import { PROFILE_SERVICE_KEYS } from "./profile-services.js";

it("lists every Profile service under the id its definition is registered with", () => {
  // Host 按左边的 id 取、按右边定义的类型用。两边的 id 不一样时，取到的是另一个服务，类型却照旧通过。
  const mismatched = Object.entries(PROFILE_SERVICE_KEYS).filter(([id, key]) => key.id !== id).map(([id, key]) => `${id} -> ${key.id}`);
  expect(mismatched).toEqual([]);
  expect(Object.keys(PROFILE_SERVICE_KEYS)).toEqual(["session.runtime", "agent.runtime", "headless.runner", "harness.control", "host.application", "desktop.app", "english-learning"]);
});
