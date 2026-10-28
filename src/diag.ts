// 诊断文件：真机上哪一步没找到入口、当时屏幕上有什么，导出来发给开发者排查。
// 不含备份里的设置原值以外的隐私数据，但屏幕文字里可能有账号昵称。

import type { DeviceInfo, Shell } from "./types";
import type { ExecDiag, InspectResult, Outcome } from "./engine";

/** 各家系统版本号所在的属性，没有的读出来是空的。 */
const ROM_PROPS = [
  "ro.build.display.id",
  "ro.build.fingerprint",
  "ro.mi.os.version.name",
  "ro.miui.ui.version.name",
  "ro.build.version.opporom",
  "ro.build.version.oplusrom",
  "ro.vivo.os.version",
  "ro.vivo.os.build.display.id",
  "ro.build.version.magic",
  "ro.build.version.emui",
  "hw_sc.build.platform.version",
  "ro.build.version.oneui",
  "ro.build.version.sdk",
];

export async function readRom(sh: Shell): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of ROM_PROPS) {
    const v = (await sh.run(`getprop ${k}`)).out.trim();
    if (v) out[k] = v;
  }
  return out;
}

export interface Diagnostics {
  format: "care-mode-diagnostics";
  version: 1;
  /** run=正式设置，inspect=只检查不改。 */
  mode: "run" | "inspect";
  createdAt: string;
  device: DeviceInfo;
  rom: Record<string, string>;
  results: Record<string, Outcome | InspectResult>;
  logs: { level: string; text: string }[];
  snaps: ExecDiag["snaps"];
}

export function buildDiagnostics(
  device: DeviceInfo,
  rom: Record<string, string>,
  results: Diagnostics["results"],
  logs: Diagnostics["logs"],
  diag: ExecDiag,
  mode: Diagnostics["mode"],
): Diagnostics {
  return { format: "care-mode-diagnostics", version: 1, mode, createdAt: new Date().toISOString(), device, rom, results, logs, snaps: diag.snaps };
}
