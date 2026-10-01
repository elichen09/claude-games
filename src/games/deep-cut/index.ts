import type { GameModule } from "@/lib/games/types";
import { mountDeepCut } from "./game";
import "./deep-cut.css";

const deepCut: GameModule = {
  mount: (root, ctx) => {
    root.classList.add("dc");
    const unmount = mountDeepCut(root, ctx);
    return () => { unmount(); root.classList.remove("dc"); };
  },
};

export default deepCut;
