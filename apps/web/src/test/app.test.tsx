import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { App } from "../app/App";
import { ConnectionStore } from "../connection/connection-store";
import { fakeHostHandler, fakeSockets } from "./helpers/fake-host";

it("renders without throwing", () => {
  expect(() => render(<App store={new ConnectionStore({ createSocket: fakeSockets(() => fakeHostHandler()).create })} />)).not.toThrow();
});

it("keeps the store usable after the StrictMode remount", async () => {
  const store = new ConnectionStore({ createSocket: fakeSockets(() => fakeHostHandler()).create });
  render(<StrictMode><App store={store} /></StrictMode>);
  await store.pair("http://127.0.0.1:4317", "GOOD", "test");
  expect(store.getState().status).toBe("ready");
});
