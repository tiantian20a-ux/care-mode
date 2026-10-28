import type { Ui } from "../ui";
import { honor } from "./honor";
import { huawei } from "./huawei";
import { oppo } from "./oppo";
import { samsung } from "./samsung";
import { vivo } from "./vivo";
import { xiaomi } from "./xiaomi";

export const RECIPES: Record<string, Record<string, (ui: Ui) => Promise<void>>> = { xiaomi, oppo, vivo, honor, huawei, samsung };
