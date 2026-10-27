import type { Ui } from "../ui";
import { xiaomi } from "./xiaomi";

export const RECIPES: Record<string, Record<string, (ui: Ui) => Promise<void>>> = { xiaomi };
