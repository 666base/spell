import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import "./App.css";

const appModule = /Android/.test(navigator.userAgent)
  ? import("./MobileApp")
  : import("./App");

void appModule.then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
