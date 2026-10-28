import type { Ui } from "../ui";
import { honor } from "./honor";
import { oppo } from "./oppo";
import { vivo } from "./vivo";
import { xiaomi } from "./xiaomi";

export const RECIPES: Record<string, Record<string, (ui: Ui) => Promise<void>>> = { xiaomi, oppo, vivo, honor };
