import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";

document.documentElement.classList.add("dark");

// Sin StrictMode: el doble montaje de dev no se lleva bien con xterm imperativo.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
