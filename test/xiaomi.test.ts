import { describe, expect, it } from "vitest";
import commonJson from "../rules/common.json";
import xiaomiJson from "../rules/xiaomi.json";
import type { Pack } from "../src/types";
import { FakePhone, demoState } from "../src/fake-phone";
import { switchStates } from "../src/fake-ui";
import { brandPackFor, execute, mergePacks, preflight, prepare, restoreBackup, skipReason, validateBackup, type Log } from "../src/engine";

const common = commonJson as unknown as Pack;
const xiaomi = xiaomiJson as unknown as Pack;
const quiet: Log = () => {};
const uiRules = xiaomi.rules.filter((r) => r.executor === "ui").map((r) => ({ id: r.id, params: {} }));

async function run(phone: FakePhone, selections: { id: string; params: Record<string, string> }[]) {
  const pf = await preflight(phone, common);
  const pack = mergePacks(common, brandPackFor(pf.device, [xiaomi]));
  const { backup, plan } = await prepare(phone, pack, pf.device, selections, quiet);
  const logs: string[] = [];
  const result = await execute(phone, plan, (_, t) => logs.push(t));
  return { pf, pack, backup, plan, result, logs };
}

describe("小米规则包", () => {
  it("按品牌识别：Redmi、POCO、Xiaomi 都用小米包，OPPO 不用", () => {
    const dev = (brand: string, manufacturer: string) => ({ brand, manufacturer, model: "x", sdk: 34, release: "14" });
    expect(brandPackFor(dev("Redmi", "Xiaomi"), [xiaomi])?.pack).toBe("xiaomi");
    expect(brandPackFor(dev("POCO", "Xiaomi"), [xiaomi])?.pack).toBe("xiaomi");
    expect(brandPackFor(dev("xiaomi", "xiaomi"), [xiaomi])?.pack).toBe("xiaomi");
    expect(brandPackFor(dev("OPPO", "OPPO"), [xiaomi])).toBeUndefined();
  });

  it("合并后收尾规则仍在最后", () => {
    const pack = mergePacks(common, xiaomi);
    expect(pack.rules[pack.rules.length - 1].id).toBe("developer-off");
    expect(pack.rules.find((r) => r.id === "xiaomi-msa")?.group).toBe(xiaomi.title);
  });

  it("9 段界面配方把广告开关关掉，该留的都留着", async () => {
    const phone = new FakePhone(demoState());
    const { result, logs } = await run(phone, uiRules);
    const st = switchStates(phone.ui);
    const off = [
      "adsvc·个性化广告推荐",
      "marketPrivacy·个性化服务",
      "marketNotify·新手帮助",
      "secPrivacy·个性化推荐",
      "secClean·推荐内容",
      "dlFeed·资源推荐",
      "dlFeed·热榜推荐",
      "themeSettings·每次联网时通知",
      "themePrivacy·个性化推荐",
      "brPrivacy·个性化内容推荐",
      "brPrivacy·个性化广告推荐",
      "brHome·宫格位推送",
      "brSearch·显示猜你想搜模块",
      "brFunc·小说",
      "qsHome·搜索提示词",
      "qsApps·推荐未安装应用",
      ...["推荐", "微博", "资讯", "全网", "影视", "音乐", "小说", "知乎", "精选"].map((x) => `qsHot·${x}`),
      "assistant·推荐卡片",
      "assistant·热门活动",
      "paPrivacy·个性化推荐",
      "wUx·内容推广",
      "wUx·天气视频卡片",
      "cUx·内容推广",
    ];
    const kept = [
      "marketNotify·推送消息",
      "marketNotify·应用更新",
      "themeSettings·自动更新",
      "brPrivacy·保存密码",
      "brFunc·我的网盘",
      "qsApps·展示常用应用",
      "qsHot·体育",
      "assistant·搜索框",
      "assistant·出行助手",
      "wSettings·天气预警",
      "wSettings·异常天气提醒",
      "cSettings·节假日提醒",
    ];
    for (const k of off) expect(st[k], `${k} 应该关掉`).toBe(false);
    for (const k of kept) expect(st[k], `${k} 应该保留`).toBe(true);
    // 保护类开关被打开
    expect(st["adsvc·限制广告跟踪"]).toBe(true);
    expect(st["secClean·自动清理"]).toBe(false);
    expect(Object.values(result).every((r) => r === "ok"), logs.join("\n")).toBe(true);
    // 应用商店打开时弹的更新框被关掉了
    expect(logs.some((l) => l.includes("以后再说"))).toBe(true);
  });

  it("应用内开关生成手动还原清单，备份文件能通过校验", async () => {
    const phone = new FakePhone(demoState());
    const { backup } = await run(phone, uiRules);
    const manual = backup.rules.flatMap((r) => r.restore).filter((o) => o.op === "manual");
    expect(manual.length).toBe(32); // 31 个关掉的 + 1 个打开的保护开关
    expect(manual.some((o) => o.op === "manual" && o.text.includes("应用商店 · 通知设置：把「新手帮助」重新打开"))).toBe(true);
    expect(manual.some((o) => o.op === "manual" && o.text.includes("把「限制广告跟踪」关掉"))).toBe(true);
    const logs: string[] = [];
    await restoreBackup(phone, validateBackup(JSON.parse(JSON.stringify(backup))), (_, t) => logs.push(t));
    expect(logs.filter((l) => l.startsWith("需要手动还原")).length).toBe(32);
  });

  it("暂停 msa 并禁止联网，还原时都恢复", async () => {
    const phone = new FakePhone(demoState());
    const { backup, result } = await run(phone, [{ id: "xiaomi-msa", params: {} }]);
    expect(result["xiaomi-msa"]).toBe("ok");
    expect(phone.s.suspended).toContain("com.miui.systemAdSolution");
    expect(phone.s.netOff).toContain("com.miui.systemAdSolution");
    await restoreBackup(phone, backup, quiet);
    expect(phone.s.suspended).not.toContain("com.miui.systemAdSolution");
    expect(phone.s.netOff).not.toContain("com.miui.systemAdSolution");
  });

  it("系统不支持禁止联网时只暂停", async () => {
    const st = demoState();
    st.pkgNetworking = false;
    const phone = new FakePhone(st);
    await run(phone, [{ id: "xiaomi-msa", params: {} }]);
    expect(phone.s.suspended).toContain("com.miui.systemAdSolution");
    expect(phone.log.some((c) => c.includes("set-package-networking-enabled"))).toBe(false);
  });

  it("没开「USB 调试（安全设置）」时，需要点屏幕的项目跳过，不乱点", async () => {
    const st = demoState();
    st.inputAllowed = false;
    const phone = new FakePhone(st);
    const pf = await preflight(phone, common);
    expect(pf.inputAllowed).toBe(false);
    const rule = xiaomi.rules.find((r) => r.executor === "ui")!;
    expect(skipReason(rule, pf.device && { sdk: 34, online: true, inputAllowed: pf.inputAllowed })).toBeTruthy();
  });

  it("锁屏时界面配方跳过", async () => {
    const st = demoState();
    st.locked = true;
    const phone = new FakePhone(st);
    const before = switchStates(phone.ui);
    const { result } = await run(phone, uiRules.slice(0, 2));
    expect(Object.values(result).every((r) => r === "partial")).toBe(true);
    expect(switchStates(phone.ui)).toEqual(before);
  });

  it("手机上没装的应用会跳过这一段，不影响其他段", async () => {
    const st = demoState();
    st.packages = st.packages.filter((p) => p !== "com.android.thememanager");
    const phone = new FakePhone(st);
    const { result } = await run(phone, uiRules);
    expect(result["xiaomi-ui-themes"]).toBe("partial");
    expect(result["xiaomi-ui-browser"]).toBe("ok");
  });
});
