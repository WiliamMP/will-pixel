import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Follow the Windows theme live (shadcn switches palettes with the "dark" class)
const media = matchMedia("(prefers-color-scheme: dark)");
media.addEventListener("change", () => document.documentElement.classList.toggle("dark", media.matches));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
