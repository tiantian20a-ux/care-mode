import { describe, expect, it } from "vitest";
import pack from "../rules/common.json";
import type { Pack } from "../src/types";
import { FakePhone, demoState } from "../src/fake-phone";
import { execute, preflight, prepare, restoreBackup, validateBackup, type Log } from "../src/engine";
import { parseChannels } from "../src/channels";

const P = pack as unknown as Pack;
const quiet: Log = () => {};
const recommended = P.rules.filter((r) => r.tier === "recommended").map((r) => ({ id: r.id, params: {} }));
const everything = P.rules.map((r) => ({ id: r.id, params: {} }));

async function runAll(phone: FakePhone, selections = everything) {
  const pf = await preflight(phone, P);
  const { backup, plan } = await prepare(phone, P, pf.device, selections, quiet);
  const result = await execute(phone, plan, quiet);
  return { pf, backup, plan, result };
}

describe("通用规则包", () => {
  it("在演示手机上全部执行成功", async () => {
    const phone = new FakePhone(demoState());
    const { result } = await runAll(phone);
    expect(Object.values(result).every((r) => r === "ok")).toBe(true);
    const s = phone.s;
    expect(s.settings["system/font_scale"]).toBe("1.3");
    expect(s.settings["secure/long_press_timeout"]).toBe("1000");
    expect(s.settings["global/private_dns_mode"]).toBe("hostname");
    expect(s.settings["global/private_dns_specifier"]).toBe("dns.adguard-dns.com");
    expect(s.density.override).toBe(506);
    expect(Object.values(s.appops.REQUEST_INSTALL_PACKAGES).every((m) => m === "deny")).toBe(true);
    expect(s.suspended).toEqual(["com.miui.hybrid"]);
    const off = s.channels.filter((c) => c.importance === 0).map((c) => c.id).sort();
    expect(off).toEqual(["hot", "promo", "recommend"]);
    expect(phone.disconnected).toBe(true); // 最后一步关掉了 USB 调试
  });

  it("不碰验证码、物流、安全类通知和跳过名单里的 App", async () => {
    const phone = new FakePhone(demoState());
    await runAll(phone);
    const byId = Object.fromEntries(phone.s.channels.map((c) => [c.id, c.importance]));
    expect(byId.logistics).toBeGreaterThan(0);
    expect(byId.security).toBeGreaterThan(0);
    expect(byId.im).toBeGreaterThan(0);
    expect(byId.mm_promo).toBeGreaterThan(0); // 微信在跳过名单
  });

  it("从备份能完整还原", async () => {
    const before = demoState();
    const phone = new FakePhone(demoState());
    const { backup } = await runAll(phone);
    phone.disconnected = false; // 模拟重新打开 USB 调试后再连上
    const restored = validateBackup(JSON.parse(JSON.stringify(backup)));
    expect(await restoreBackup(phone, restored, quiet)).toBe(0);
    const s = phone.s;
    expect(s.settings["system/font_scale"]).toBe("1.0");
    expect(s.settings["secure/long_press_timeout"]).toBe("400");
    expect(s.settings["global/private_dns_mode"]).toBe("opportunistic");
    expect(s.settings["global/private_dns_specifier"]).toBeUndefined();
    expect(s.density.override).toBeUndefined();
    expect(s.appops).toEqual(before.appops);
    expect(s.suspended).toEqual([]);
    expect(s.channels.map((c) => c.importance)).toEqual(before.channels.map((c) => c.importance));
  });

  it("DNS 连不上时自动改回，手机不会断网", async () => {
    const st = demoState();
    st.privateDnsReachable = false;
    const phone = new FakePhone(st);
    const { result } = await runAll(phone, recommended.filter((r) => r.id !== "developer-off"));
    expect(result["private-dns"]).toBe("rolled_back");
    expect(phone.s.settings["global/private_dns_mode"]).toBe("opportunistic");
    expect(phone.s.settings["global/private_dns_specifier"]).toBeUndefined();
    expect(result["font-scale"]).toBe("ok");
  });

  it("不是机主账户时停止", async () => {
    const st = demoState();
    st.user = 10;
    const pf = await preflight(new FakePhone(st), P);
    expect(pf.problems.some((p) => p.level === "abort")).toBe(true);
  });

  it("没联网时标记离线", async () => {
    const st = demoState();
    st.online = false;
    const pf = await preflight(new FakePhone(st), P);
    expect(pf.online).toBe(false);
    expect(pf.problems.some((p) => p.level === "warn")).toBe(true);
  });

  it("锁屏时关不掉通知，会跳过而不是乱点", async () => {
    const st = demoState();
    st.locked = true;
    const phone = new FakePhone(st);
    const { result } = await runAll(phone, [{ id: "marketing-channels", params: {} }]);
    expect(result["marketing-channels"]).toBe("partial");
    expect(phone.log.some((c) => c.startsWith("input tap"))).toBe(false);
    expect(phone.s.channels.every((c) => c.importance > 0)).toBe(true);
  });

  it("原来就有的显示大小设置，还原时写回原值", async () => {
    const st = demoState();
    st.density.override = 400;
    const phone = new FakePhone(st);
    const { backup } = await runAll(phone, [{ id: "display-size", params: {} }]);
    expect(phone.s.density.override).toBe(506);
    await restoreBackup(phone, backup, quiet);
    expect(phone.s.density.override).toBe(400);
  });

  it("拒绝被改过的备份文件", () => {
    const bad = {
      format: "care-mode-backup",
      version: 1,
      rules: [{ id: "x", title: "x", restore: [{ op: "setting", ns: "global", key: "a; rm -rf /sdcard", value: "1" }] }],
    };
    expect(() => validateBackup(bad)).toThrow();
    expect(() => validateBackup({ format: "other" })).toThrow();
  });

  it("参数不在可选范围时拒绝执行", async () => {
    const phone = new FakePhone(demoState());
    const pf = await preflight(phone, P);
    await expect(prepare(phone, P, pf.device, [{ id: "font-scale", params: { scale: "3" } }], quiet)).rejects.toThrow();
  });
});

describe("解析 dumpsys notification", () => {
  it("名字里有逗号和括号也能解析", () => {
    const dump = [
      "  AppSettings: com.example.app (10234) importance=DEFAULT",
      "      NotificationChannel{mId='a.b', mName=活动, 优惠 (限时), mDescription=x, mImportance=3, mBypassDnd=false}",
      "  AppSettings: com.other (10235)",
      "      NotificationChannel{mId='c', mName=推荐, mDescription=, mImportance=0, mBypassDnd=false}",
    ].join("\n");
    expect(parseChannels(dump)).toEqual([
      { pkg: "com.example.app", id: "a.b", name: "活动, 优惠 (限时)", importance: 3 },
      { pkg: "com.other", id: "c", name: "推荐", importance: 0 },
    ]);
  });
});
