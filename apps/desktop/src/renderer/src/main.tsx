import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme/variables.css";
import "./theme/reset.css";
import "./theme/layout.css";
import "highlight.js/styles/github-dark.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
