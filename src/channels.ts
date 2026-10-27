// 通知类别（Notification Channel）的读取和开关。
// 系统没有直接关某个类别的 shell 命令，所以打开系统的类别设置页，用 uiautomator 找到开关点一下，
// 再从 dumpsys 确认真的关掉了；没确认就把开关点回去，并报告跳过。

import type { Shell } from "./types";
import { shQuote } from "./util";

export interface Channel {
  pkg: string;
  id: string;
  name: string;
  importance: number;
}

export function parseChannels(dump: string): Channel[] {
  const seen = new Map<string, Channel>();
  let pkg = "";
  for (const line of dump.split("\n")) {
    const app = /AppSettings:\s+([\w.]+)\s+\(/.exec(line);
    if (app) {
      pkg = app[1];
      continue;
    }
    const m = /NotificationChannel\{mId='([^']*)', mName=(.*?), mDescription=.*?mImportance=(-?\d+)/.exec(line);
    if (m && pkg) {
      const key = `${pkg}/${m[1]}`;
      if (!seen.has(key)) seen.set(key, { pkg, id: m[1], name: m[2], importance: Number(m[3]) });
    }
  }
  return [...seen.values()];
}

export async function listChannels(sh: Shell, listCmd = "dumpsys notification --noredact"): Promise<Channel[]> {
  return parseChannels((await sh.run(listCmd, { timeoutMs: 30000 })).out);
}

interface UiNode {
  pkg: string;
  checkable: boolean;
  checked: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function parseUi(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const attr = (k: string) => new RegExp(`\\b${k}="([^"]*)"`).exec(m[1])?.[1] ?? "";
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr("bounds"));
    if (!b) continue;
    nodes.push({
      pkg: attr("package"),
      checkable: attr("checkable") === "true",
      checked: attr("checked") === "true",
      x1: +b[1],
      y1: +b[2],
      x2: +b[3],
      y2: +b[4],
    });
  }
  return nodes;
}

async function dumpUi(sh: Shell): Promise<UiNode[]> {
  const { out } = await sh.run("uiautomator dump /sdcard/care_ui.xml >/dev/null 2>&1; cat /sdcard/care_ui.xml; rm -f /sdcard/care_ui.xml", {
    timeoutMs: 20000,
  });
  return parseUi(out);
}

/** 类别设置页最上面那个开关就是「允许通知」。锁屏或页面不对时返回 undefined。 */
function mainSwitch(nodes: UiNode[]): UiNode | undefined {
  if (!nodes.length || nodes[0].pkg === "com.android.systemui") return undefined;
  return nodes.filter((n) => n.checkable && n.y2 > n.y1).sort((a, b) => a.y1 - b.y1)[0];
}

async function tap(sh: Shell, n: UiNode) {
  const x = Math.round((n.x1 + n.x2) / 2);
  const y = Math.round((n.y1 + n.y2) / 2);
  // 有的系统吞 input tap，用 80 毫秒的短按代替。
  await sh.run(`input swipe ${x} ${y} ${x} ${y} 80`);
}

async function currentImportance(sh: Shell, ch: Pick<Channel, "pkg" | "id">): Promise<number | undefined> {
  return (await listChannels(sh)).find((c) => c.pkg === ch.pkg && c.id === ch.id)?.importance;
}

export async function setChannelEnabled(sh: Shell, ch: Channel, on: boolean): Promise<boolean> {
  const reached = (imp: number | undefined) => imp !== undefined && (on ? imp > 0 : imp === 0);
  if (reached(await currentImportance(sh, ch))) return true;
  try {
    await sh.run("input keyevent KEYCODE_WAKEUP");
    await sh.run(
      `am start -a android.settings.CHANNEL_NOTIFICATION_SETTINGS --es android.provider.extra.APP_PACKAGE ${ch.pkg} --es android.provider.extra.CHANNEL_ID ${shQuote(ch.id)}`,
    );
    await sh.sleep(1500);
    const sw = mainSwitch(await dumpUi(sh));
    if (!sw || sw.checked === on) return false;
    await tap(sh, sw);
    await sh.sleep(800);
    if (reached(await currentImportance(sh, ch))) return true;
    // 点到的不是「允许通知」：如果开关状态变了，点回去。
    const again = mainSwitch(await dumpUi(sh));
    if (again && again.checked !== sw.checked) await tap(sh, again);
    return false;
  } finally {
    await sh.run("input keyevent KEYCODE_HOME");
  }
}
