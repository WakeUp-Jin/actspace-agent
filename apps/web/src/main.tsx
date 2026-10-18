import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ConnectionStore } from "./connection/connection-store";
import "./styles/index.css";

const store = new ConnectionStore();
createRoot(document.getElementById("root")!).render(<StrictMode><App store={store} /></StrictMode>);
