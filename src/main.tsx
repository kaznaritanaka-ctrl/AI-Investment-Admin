import { createRoot } from "react-dom/client";
import { Console } from "./Console.tsx";
import "./style.css";
import "./console.css";
createRoot(document.getElementById("root")!).render(<Console />);
