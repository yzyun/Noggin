import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
import "./index.css";

initTheme();

async function boot() {
  // Outside Tauri (plain `npm run dev` in a browser) there is no Rust
  // backend — run against an in-memory demo vault instead.
  if (!("__TAURI_INTERNALS__" in window)) {
    (await import("./dev/demoBackend")).installDemoBackend();
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
