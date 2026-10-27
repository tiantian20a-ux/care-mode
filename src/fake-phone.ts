// 模拟手机：解释规则引擎会发出的 adb shell 命令，用于自动测试和网页的演示模式。

import type { Shell } from "./types";
import { FakeUi, fakeXiaomiApps } from "./fake-ui";

export interface FakeChannel {
  pkg: string;
  id: string;
  name: string;
  importance: number;
  prevImportance?: number;
}

export interface FakeState {
  props: Record<string, string>;
  settings: Record<string, string>;
  density: { physical: number; override?: number };
  appops: Record<string, Record<string, string>>; // op -> pkg -> mode
  packages: string[];
  suspended: string[];
  channels: FakeChannel[];
  online: boolean;
  /** 设成 false 模拟 DNS 服务器连不上：一开私人 DNS 就解析不了域名。 */
  privateDnsReachable: boolean;
  locked: boolean;
  user: number;
  /** 电脑能不能点屏幕（小米没开「USB 调试（安全设置）」时不能）。 */
  inputAllowed: boolean;
  /** 系统有没有按应用禁止联网的命令。 */
  pkgNetworking: boolean;
  netOff: string[];
}

export function demoState(): FakeState {
  return {
    props: {
      "ro.product.brand": "Redmi",
      "ro.product.manufacturer": "Xiaomi",
      "ro.product.model": "Redmi Note 13（演示）",
      "ro.build.version.sdk": "34",
      "ro.build.version.release": "14",
    },
    settings: {
      "system/font_scale": "1.0",
      "secure/long_press_timeout": "400",
      "global/private_dns_mode": "opportunistic",
      "global/development_settings_enabled": "1",
      "global/adb_enabled": "1",
    },
    density: { physical: 440 },
    appops: { REQUEST_INSTALL_PACKAGES: { "com.tencent.mm": "allow", "com.android.browser": "allow", "com.ss.android.ugc.aweme": "allow" } },
    packages: [
      "com.miui.hybrid",
      "com.tencent.mm",
      "com.android.browser",
      "com.ss.android.ugc.aweme",
      "com.taobao.taobao",
      "com.miui.systemAdSolution",
      "com.xiaomi.market",
      "com.miui.securitycenter",
      "com.android.providers.downloads.ui",
      "com.android.thememanager",
      "com.android.quicksearchbox",
      "com.miui.personalassistant",
      "com.miui.weather2",
      "com.android.calendar",
      "com.android.settings",
    ],
    suspended: [],
    channels: [
      { pkg: "com.taobao.taobao", id: "promo", name: "优惠活动", importance: 3 },
      { pkg: "com.taobao.taobao", id: "logistics", name: "物流通知", importance: 4 },
      { pkg: "com.ss.android.ugc.aweme", id: "recommend", name: "推荐内容", importance: 3 },
      { pkg: "com.ss.android.ugc.aweme", id: "im", name: "私信", importance: 4 },
      { pkg: "com.android.browser", id: "hot", name: "热点资讯", importance: 3 },
      { pkg: "com.android.browser", id: "security", name: "安全提醒（活动）", importance: 3 },
      { pkg: "com.tencent.mm", id: "message_channel_new_id", name: "新消息通知", importance: 4 },
      { pkg: "com.tencent.mm", id: "mm_promo", name: "活动推荐", importance: 3 },
    ],
    online: true,
    privateDnsReachable: true,
    locked: false,
    user: 0,
    inputAllowed: true,
    pkgNetworking: true,
    netOff: [],
  };
}

const ok = (out = "") => ({ out, code: 0 });
const err = (out: string, code = 1) => ({ out, code });

export class FakePhone implements Shell {
  log: string[] = [];
  disconnected = false;
  private page?: FakeChannel;

  constructor(
    public s: FakeState,
    private delayMs = 0,
    public ui: FakeUi = fakeXiaomiApps(),
  ) {}

  async sleep(ms: number) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, Math.min(ms, this.delayMs * 4)));
  }

  async run(cmd: string): Promise<{ out: string; code: number }> {
    if (this.disconnected) throw new Error("设备已断开");
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    this.log.push(cmd);
    return this.exec(cmd);
  }

  private dnsWorks() {
    if (!this.s.online) return false;
    return this.s.settings["global/private_dns_mode"] !== "hostname" || this.s.privateDnsReachable;
  }

  private exec(cmd: string): { out: string; code: number } {
    const s = this.s;
    let m: RegExpExecArray | null;
    const unq = (v: string) => (v.startsWith("'") ? v.slice(1, -1).replace(/'\\''/g, "'") : v);

    if ((m = /^getprop (\S+)$/.exec(cmd))) return ok((s.props[m[1]] ?? "") + "\n");
    if (cmd === "am get-current-user") return ok(`${s.user}\n`);
    if ((m = /^ping -c 1 -W \d+ (\S+) 2>&1$/.exec(cmd))) {
      if (!this.dnsWorks()) return err(`ping: unknown host ${m[1]}\n`, 2);
      return ok(`PING ${m[1]} (110.242.68.66) 56(84) bytes of data.\n64 bytes from 110.242.68.66: icmp_seq=1 ttl=52 time=31.2 ms\n`);
    }
    if ((m = /^settings get (system|secure|global) ([\w.]+)$/.exec(cmd))) return ok((s.settings[`${m[1]}/${m[2]}`] ?? "null") + "\n");
    if ((m = /^settings put (system|secure|global) ([\w.]+) (.+)$/.exec(cmd))) {
      s.settings[`${m[1]}/${m[2]}`] = unq(m[3]);
      if (m[2] === "adb_enabled" && unq(m[3]) === "0") {
        this.disconnected = true;
        throw new Error("设备已断开");
      }
      return ok();
    }
    if ((m = /^settings delete (system|secure|global) ([\w.]+)$/.exec(cmd))) {
      delete s.settings[`${m[1]}/${m[2]}`];
      return ok("Deleted 1 rows\n");
    }
    if (cmd === "wm density") {
      return ok(`Physical density: ${s.density.physical}\n` + (s.density.override ? `Override density: ${s.density.override}\n` : ""));
    }
    if (cmd === "wm density reset") {
      delete s.density.override;
      return ok();
    }
    if ((m = /^wm density (\d+)$/.exec(cmd))) {
      s.density.override = Number(m[1]);
      return ok();
    }
    if ((m = /^cmd appops query-op --user 0 (\w+) (\w+)$/.exec(cmd))) {
      const table = s.appops[m[1]] ?? {};
      return ok(Object.keys(table).filter((p) => table[p] === m![2]).map((p) => p + "\n").join(""));
    }
    if ((m = /^cmd appops set --user 0 ([\w.]+) (\w+) (\w+)$/.exec(cmd))) {
      (s.appops[m[2]] ??= {})[m[1]] = m[3];
      return ok();
    }
    if ((m = /^pm list packages ([\w.]+)$/.exec(cmd))) {
      return ok(s.packages.filter((p) => p.includes(m![1])).map((p) => `package:${p}\n`).join(""));
    }
    if ((m = /^dumpsys package ([\w.]+)$/.exec(cmd))) {
      if (!s.packages.includes(m[1])) return ok(`Unable to find package: ${m[1]}\n`);
      return ok(`Packages:\n  Package [${m[1]}]\n    User 0: ceDataInode=1 installed=true hidden=false suspended=${s.suspended.includes(m[1])} stopped=false\n`);
    }
    if ((m = /^pm (suspend|unsuspend) --user 0 ([\w.]+)$/.exec(cmd))) {
      if (!s.packages.includes(m[2])) return err(`Error: package ${m[2]} not found\n`);
      s.suspended = s.suspended.filter((p) => p !== m![2]);
      if (m[1] === "suspend") s.suspended.push(m[2]);
      return ok(`Package ${m[2]} new suspended state: ${m[1] === "suspend"}\n`);
    }
    if (cmd === "dumpsys notification --noredact") {
      let out = "Notification Preferences:\n";
      for (const pkg of new Set(s.channels.map((c) => c.pkg))) {
        out += `  AppSettings: ${pkg} (10123) importance=DEFAULT userLocked=0\n`;
        for (const c of s.channels.filter((c) => c.pkg === pkg)) {
          out += `      NotificationChannel{mId='${c.id}', mName=${c.name}, mDescription=, mImportance=${c.importance}, mBypassDnd=false, mLockscreenVisibility=-1000}\n`;
        }
      }
      return ok(out);
    }
    if (cmd === "input keyevent 0") return s.inputAllowed ? ok() : err("java.lang.SecurityException: Injecting to another application requires INJECT_EVENTS permission\n");
    if (cmd.startsWith("input keyevent")) {
      if (cmd.endsWith("KEYCODE_HOME")) {
        this.page = undefined;
        this.ui.home();
      }
      if (cmd.endsWith("BACK")) {
        if (this.page) this.page = undefined;
        else this.ui.back();
      }
      return ok();
    }
    if (cmd === "wm size") return ok("Physical size: 1080x2400\n");
    if (cmd === "dumpsys window | grep -m1 mCurrentFocus") {
      const f = this.page ? "com.android.settings/.notification.ChannelNotificationSettings" : this.ui.focus();
      return ok(`  mCurrentFocus=Window{1a2b3c u0 ${f}}\n`);
    }
    if (cmd === "dumpsys window | grep -m1 isKeyguardShowing") return ok(`    isKeyguardShowing=${s.locked}\n`);
    if (cmd === "am start -f 0x10008000 -a android.settings.SETTINGS") {
      this.ui.launch("com.android.settings");
      return ok("Starting: Intent { act=android.settings.SETTINGS }\n");
    }
    if ((m = /^am start -f 0x10008000 -n ([\w.]+)\/(\S+)$/.exec(cmd))) {
      if (!s.packages.includes(m[1]) || !this.ui.launch(m[1], m[2])) return err("Error: Activity class does not exist.\n");
      return ok("Starting: Intent { cmp=" + m[1] + "/" + m[2] + " }\n");
    }
    if (/^am force-stop [\w.]+$/.test(cmd)) return ok();
    if ((m = /^monkey -p ([\w.]+) -c android\.intent\.category\.LAUNCHER 1$/.exec(cmd))) {
      if (!s.packages.includes(m[1]) || !this.ui.launch(m[1])) return err("** No activities found to run, monkey aborted.\n");
      return ok("Events injected: 1\n");
    }
    if ((m = /^pm path ([\w.]+)$/.exec(cmd))) return s.packages.includes(m[1]) ? ok(`package:/system/app/${m[1]}/base.apk\n`) : err("", 1);
    if (cmd === "cmd connectivity help") return ok(s.pkgNetworking ? "  set-package-networking-enabled [true|false] [package name]\n  set-chain3-enabled [true|false]\n" : "  airplane-mode [enable|disable]\n");
    if ((m = /^cmd connectivity set-package-networking-enabled (true|false) ([\w.]+)$/.exec(cmd))) {
      s.netOff = s.netOff.filter((p) => p !== m![2]);
      if (m[1] === "false") s.netOff.push(m[2]);
      return ok();
    }
    if (cmd === "cmd connectivity set-chain3-enabled true") return ok();
    if ((m = /^am start -a android\.settings\.CHANNEL_NOTIFICATION_SETTINGS --es android\.provider\.extra\.APP_PACKAGE ([\w.]+) --es android\.provider\.extra\.CHANNEL_ID (\S+)$/.exec(cmd))) {
      const id = unq(m[2]);
      this.page = s.channels.find((c) => c.pkg === m![1] && c.id === id);
      return ok("Starting: Intent { act=android.settings.CHANNEL_NOTIFICATION_SETTINGS }\n");
    }
    if (cmd.startsWith("uiautomator dump")) {
      if (s.locked) return ok(`<?xml version='1.0'?><hierarchy rotation="0"><node package="com.android.systemui" checkable="false" checked="false" bounds="[0,0][1080,2400]" /></hierarchy>`);
      if (!this.page) return ok(this.ui.dump());
      const on = this.page.importance > 0;
      return ok(
        `<?xml version='1.0'?><hierarchy rotation="0"><node package="com.android.settings" checkable="false" checked="false" bounds="[0,0][1080,2400]">` +
          `<node package="com.android.settings" text="允许通知" checkable="true" checked="${on}" bounds="[0,300][1080,450]" />` +
          `<node package="com.android.settings" text="悬浮通知" checkable="true" checked="true" bounds="[0,600][1080,750]" />` +
          `</node></hierarchy>`,
      );
    }
    if ((m = /^input swipe (\d+) (\d+) (\d+) (\d+) \d+$/.exec(cmd)) && (m[1] !== m[3] || m[2] !== m[4])) {
      if (!s.inputAllowed) return err("INJECT_EVENTS permission denied\n");
      this.ui.scroll(Number(m[2]) - Number(m[4]));
      return ok();
    }
    if ((m = /^input (?:tap|swipe) (\d+) (\d+)(?: \1 \2 \d+)?$/.exec(cmd))) {
      if (!s.inputAllowed) return err("INJECT_EVENTS permission denied\n");
      const y = Number(m[2]);
      if (!this.page) {
        this.ui.tap(Number(m[1]), y);
        return ok();
      }
      if (this.page && y >= 300 && y <= 450) {
        const c = this.page;
        if (c.importance > 0) {
          c.prevImportance = c.importance;
          c.importance = 0;
        } else c.importance = c.prevImportance ?? 3;
      }
      return ok();
    }
    return err(`/system/bin/sh: unknown command in fake phone: ${cmd}\n`, 127);
  }
}
