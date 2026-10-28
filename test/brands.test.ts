import { describe, expect, it } from "vitest";
import commonJson from "../rules/common.json";
import oppoJson from "../rules/oppo.json";
import vivoJson from "../rules/vivo.json";
import honorJson from "../rules/honor.json";
import xiaomiJson from "../rules/xiaomi.json";
import huaweiJson from "../rules/huawei.json";
import samsungJson from "../rules/samsung.json";
import type { Pack } from "../src/types";
import { FakePhone, demoState } from "../src/fake-phone";
import { fakeXiaomiApps } from "../src/fake-ui";
import { switchStates } from "../src/fake-ui";
import { brandPhone } from "../src/fake-brands";
import { type ExecDiag, brandPackFor, execute, inspect, mergePacks, preflight, prepare, restoreBackup, validateBackup, type Log } from "../src/engine";

const common = commonJson as unknown as Pack;
const packs = [xiaomiJson, oppoJson, vivoJson, honorJson, huaweiJson, samsungJson] as unknown as Pack[];
const quiet: Log = () => {};

async function run(brand: Parameters<typeof brandPhone>[0], only?: (id: string) => boolean) {
  const { state, ui } = brandPhone(brand);
  const phone = new FakePhone(state, 0, ui);
  const pf = await preflight(phone, common);
  const brandPack = brandPackFor(pf.device, packs)!;
  const pack = mergePacks(common, brandPack);
  const selections = brandPack.rules.filter((r) => (only ? only(r.id) : r.executor === "ui")).map((r) => ({ id: r.id, params: {} }));
  const { backup, plan } = await prepare(phone, pack, pf.device, selections, quiet);
  const logs: string[] = [];
  const result = await execute(phone, plan, (_, t) => logs.push(t));
  return { phone, ui, brandPack, backup, result, logs, st: switchStates(ui) };
}

function expectStates(st: Record<string, boolean>, off: string[], kept: string[]) {
  for (const k of off) expect(st[k], `${k} 应该关掉`).toBe(false);
  for (const k of kept) expect(st[k], `${k} 应该保留`).toBe(true);
}

describe("品牌识别", () => {
  const dev = (brand: string, manufacturer = brand) => ({ brand, manufacturer, model: "x", sdk: 34, release: "14" });
  it.each([
    ["OPPO", "oppo"],
    ["OnePlus", "oppo"],
    ["realme", "oppo"],
    ["vivo", "vivo"],
    ["iQOO", "vivo"],
    ["HONOR", "honor"],
    ["Redmi", "xiaomi"],
  ])("%s 用 %s 包", (brand, pack) => {
    expect(brandPackFor(dev(brand), packs)?.pack).toBe(pack);
  });
  it("华为、三星有包，其他品牌只用通用设置", () => {
    expect(brandPackFor(dev("HUAWEI"), packs)?.pack).toBe("huawei");
    expect(brandPackFor(dev("samsung"), packs)?.pack).toBe("samsung");
    expect(brandPackFor(dev("motorola"), packs)).toBeUndefined();
  });
  it("没验证过的华为、三星规则默认不勾", () => {
    for (const p of packs.filter((p) => p.pack === "huawei" || p.pack === "samsung")) for (const r of p.rules) expect(r.tier).toBe("optional");
  });
});

describe("OPPO / 一加 / realme", () => {
  it("界面配方关掉推广开关，保留该留的", async () => {
    const { st, result, logs, ui } = await run("oppo");
    expect(Object.values(result).every((r) => r === "ok"), logs.join("\n")).toBe(true);
    expectStates(
      st,
      [
        ...["支付宝", "淘宝", "抖音", "今日头条"].map((x) => `adtrack·${x}`),
        "paSettings2·搜索框提示词",
        "paSettings2·热点资讯",
        ...["榜单", "小说", "购物", "个性化推荐", "精选资讯"].map((x) => `qsScope·${x}`),
        ...["未下载应用推荐", "应用建议小卡", "探索发现", "活动皮肤"].map((x) => `qsCards·${x}`),
        "qsFunc·搜索框提示词",
        "qsPrivacy·个性化推荐",
        "marketRec·个性化推荐",
        "marketSvc·首页：悬浮活动图标",
        "marketSvc·首页：活动弹窗",
        "marketSvc·游戏专区：福利",
        "brPrivacy·个性化推荐",
        "brAds·开屏广告",
        "brAds·资讯列表广告",
        "brAds·摇一摇广告",
        "thMsg·消息通知",
        "thMsg·开屏广告",
        "thRec·个性化推荐",
        "vRec·个性化推荐",
        "gRec·个性化推荐",
        "breenoNews·资讯服务",
      ],
      [
        "paSettings2·服务动态",
        "paSettings2·快捷服务",
        "qsScope·APP内搜索",
        "qsScope·搜索建议",
        "qsScope·小程序",
        "qsCards·本机资产推荐",
        "marketSvc·帮助与客服",
        "marketSvc·应用安全",
        "marketSvc·存储空间清理",
        "marketSvc·自动检测风险应用",
        "marketSettings·自动更新",
        "brPrivacy·保存密码",
        "breenoNews·商圈服务",
        "breeno·快递提醒",
      ],
    );
    expect(ui.picked).toContain("paCarousel·不显示");
    expect(ui.picked).toContain("brLayout·简洁");
  });

  it("暂停广告组件，还原时恢复", async () => {
    const { phone, backup, result } = await run("oppo", (id) => id === "oppo-ad-packages");
    expect(result["oppo-ad-packages"]).toBe("ok");
    expect(phone.s.suspended).toEqual(expect.arrayContaining(["com.opos.ads", "com.heytap.pictorial"]));
    await restoreBackup(phone, validateBackup(JSON.parse(JSON.stringify(backup))), quiet);
    expect(phone.s.suspended).not.toContain("com.opos.ads");
  });
});

describe("vivo / iQOO", () => {
  it("界面配方关掉推广开关，保留预警类", async () => {
    const { st, result, logs, ui } = await run("vivo");
    expect(Object.values(result).every((r) => r === "ok"), logs.join("\n")).toBe(true);
    expectStates(
      st,
      [
        ...["个性化广告", "个性化推荐", "智能推荐服务"].map((x) => `adpriv·${x}`),
        "gsHome·搜索框推荐词",
        "gsHome·推荐卡片",
        "gsHot·热门搜索",
        "gsPers·广告个性化",
        ...["服务推荐", "资讯推荐", "内容精选", "热点资讯"].map((x) => `paRec·${x}`),
        "yuetu·阅图锁屏",
        "mAbout·个性化推荐",
        ...["签到有礼", "顶部轮播图", "开屏", "摇一摇", "限时推广"].map((x) => `mSvc·${x}`),
        "bHome·首页上滑展示资讯",
        "bPriv·个性化内容",
        "bPriv·第三方应用来源个性化推荐",
        "bWeb·网页下载相关推荐",
        "bMore·WiFi 连接跳转新闻资讯",
        "iPers·应用个性化推荐",
        "wSvc·天气相关热点资讯通知",
      ],
      ["gsHome·应用建议", "gs·历史记录", "gsPers·搜索结果个性化", "paRec·小V建议", "mSvc·我的服务", "mSvc·空间清理", "wSvc·气象预警", "wSvc·异常天气提醒", "wSvc·地震预警"],
    );
    expect(st["bWeb·无图模式"]).toBe(false);
    expect(ui.picked).toContain("bHome·极简首页");
  });

  it("关快应用服务，还原时打开", async () => {
    const { phone, backup, result } = await run("vivo", (id) => id === "vivo-quickapp");
    expect(result["vivo-quickapp"]).toBe("ok");
    expect(phone.s.settings["secure/switch_quick_app_service"]).toBe("0");
    await restoreBackup(phone, backup, quiet);
    expect(phone.s.settings["secure/switch_quick_app_service"]).toBe("1");
  });

  it("系统里没有快应用开关时不新建", async () => {
    const { state, ui } = brandPhone("vivo");
    delete state.settings["secure/switch_quick_app_service"];
    const phone = new FakePhone(state, 0, ui);
    const pf = await preflight(phone, common);
    const pack = mergePacks(common, brandPackFor(pf.device, packs));
    const { plan } = await prepare(phone, pack, pf.device, [{ id: "vivo-quickapp", params: {} }], quiet);
    await execute(phone, plan, quiet);
    expect(phone.s.settings["secure/switch_quick_app_service"]).toBeUndefined();
  });
});

describe("荣耀", () => {
  it("界面配方关掉推广开关，广告标识连系统应用一起关", async () => {
    const { st, result, logs, ui } = await run("honor");
    expect(Object.values(result).every((r) => r === "ok"), logs.join("\n")).toBe(true);
    expectStates(
      st,
      [
        ...["支付宝", "淘宝", "抖音", "美团", "浏览器", "应用市场", "主题"].map((x) => `adList·${x}`),
        "oaid·智能推荐服务",
        "qsHome·热搜榜",
        "qsHome·热搜词推荐",
        "qsPers·个性化推荐",
        "qsPers·个性化广告",
        ...["智能推荐", "个性化广告", "个性化消息"].map((x) => `paSettings·${x}`),
        "paNews·资讯精选",
        "topApps·推荐应用",
        "topApps·推荐游戏",
        "popular·热门推荐",
        "mRec·营销服务推荐",
        "mRec·个性化服务推荐",
        "mMsg·消息通知",
        "mCenter·活动福利",
        "mCenter·游戏动态",
        "bMsg·新闻热点",
        "bMsg·兴趣推送",
        "bRec·个性化内容",
        "bAds·摇一摇",
        "bAds·扭一扭",
        "tMsg·消息",
        "tPers·个性化推荐",
        "vOther·个性化内容",
        "vOther·个性化广告",
        "vOther·OAID",
        "manager·应用推荐",
      ],
      ["qsHome·最近使用", "mMsg·应用更新", "mCenter·安装提醒", "bMsg·下载完成提醒", "vOther·自动播放", "manager·骚扰拦截"],
    );
    expect(ui.picked).toContain("bMode·简洁首页");
  });

  it("应用内开关都进手动还原清单", async () => {
    const { backup } = await run("honor");
    const manual = backup.rules.flatMap((r) => r.restore).filter((o) => o.op === "manual");
    expect(manual.length).toBeGreaterThan(20);
    expect(manual.some((o) => o.op === "manual" && o.text.includes("全部关闭"))).toBe(true);
  });

  it("百度版浏览器跳过，不影响其他段", async () => {
    const { state, ui } = brandPhone("honor");
    state.packages = state.packages.filter((p) => p !== "com.honor.browser");
    const phone = new FakePhone(state, 0, ui);
    const pf = await preflight(phone, common);
    const brandPack = brandPackFor(pf.device, packs)!;
    const pack = mergePacks(common, brandPack);
    const sel = ["honor-ui-browser", "honor-ui-themes"].map((id) => ({ id, params: {} }));
    const { plan } = await prepare(phone, pack, pf.device, sel, quiet);
    const result = await execute(phone, plan, quiet);
    expect(result["honor-ui-themes"]).toBe("ok");
    expect(switchStates(ui)["bRec·个性化内容"]).toBe(true);
  });
});

describe("华为（模拟界面按公开教程搭，只测代码路径）", () => {
  it("打开限制广告追踪，关推荐和广告", async () => {
    const { st, result, logs } = await run("huawei");
    expect(Object.values(result).every((r) => r === "ok"), logs.join("\n")).toBe(true);
    expect(st["adpriv·限制广告追踪"]).toBe(true);
    expectStates(
      st,
      ["adMore·智能推荐服务", "search·实时热点", "searchAdv·个性化推荐", "searchAdv·个性化广告", "todaySettings·个性化广告", "todaySettings·华为广告", "todaySettings·三方广告", "bMsg·资讯通知", "bPriv·个性化内容", "bAds·个性化广告", "bAds·摇一摇广告", "bAds·开屏广告"],
      ["search·搜索历史", "todaySettings·航班提醒", "bMsg·下载完成通知", "bPriv·保存密码"],
    );
  });
});

describe("三星（模拟界面按公开教程搭，只测代码路径）", () => {
  it("关定制广告、账户优惠和商店定制服务", async () => {
    const { st, result, logs } = await run("samsung");
    expect(Object.values(result).every((r) => r === "ok"), logs.join("\n")).toBe(true);
    expectStates(
      st,
      ["custom·定制广告和直接营销", "acctPriv·获取新闻和特别优惠", "acctPriv·使用三星账户数据改进个性化广告", "storeCustom·定制服务"],
      ["custom·使用情况分析", "acctPriv·两步验证", "storeSettings·自动更新应用"],
    );
  });

  it("英文界面找不到中文入口时跳过，不乱点", async () => {
    const { state, ui } = brandPhone("samsung");
    ui.pages.settings.items = [{ text: "Connections", to: "none" }];
    const phone = new FakePhone(state, 0, ui);
    const pf = await preflight(phone, common);
    const pack = mergePacks(common, brandPackFor(pf.device, packs));
    const { plan } = await prepare(phone, pack, pf.device, [{ id: "samsung-ui-customization", params: {} }], quiet);
    await execute(phone, plan, quiet);
    expect(switchStates(ui)["custom·定制广告和直接营销"]).toBe(true);
  });
});

describe("诊断文件", () => {
  it("没找到入口时记下当时的屏幕和应用版本", async () => {
    const { state, ui } = brandPhone("huawei");
    ui.pages.settings.items = [{ text: "WLAN", to: "none" }, { text: "安全", to: "none" }];
    const phone = new FakePhone(state, 0, ui);
    const pf = await preflight(phone, common);
    const pack = mergePacks(common, brandPackFor(pf.device, packs));
    const { plan } = await prepare(phone, pack, pf.device, [{ id: "huawei-ui-adprivacy", params: {} }, { id: "huawei-ui-browser", params: {} }], quiet);
    const diag: ExecDiag = { snaps: [] };
    await execute(phone, plan, quiet, diag);
    const miss = diag.snaps.filter((x) => x.rule === "huawei-ui-adprivacy");
    expect(miss.length).toBeGreaterThan(0);
    expect(miss[0].note).toContain("没找到");
    expect(miss[0].focus).toContain("com.android.settings");
    expect(miss[0].appVersion).toBe("1.0.0-demo");
    expect(miss[0].screen.some((l) => l.includes('"安全"'))).toBe(true);
    // 浏览器那段路径对得上，不留记录
    expect(diag.snaps.some((x) => x.rule === "huawei-ui-browser")).toBe(false);
  });
});

describe("只检查，不改设置", () => {
  const phones = {
    xiaomi: () => ({ state: demoState(), ui: fakeXiaomiApps() }),
    oppo: () => brandPhone("oppo"),
    vivo: () => brandPhone("vivo"),
    honor: () => brandPhone("honor"),
    huawei: () => brandPhone("huawei"),
    samsung: () => brandPhone("samsung"),
  };
  it.each(Object.keys(phones))("%s：找到要改的开关，但一个都不动", async (name) => {
    const { state, ui } = phones[name as keyof typeof phones]();
    const phone = new FakePhone(state, 0, ui);
    const settingsBefore = JSON.stringify(phone.s.settings);
    const before = switchStates(ui);
    const pf = await preflight(phone, common);
    const brandPack = brandPackFor(pf.device, packs)!;
    const pack = mergePacks(common, brandPack);
    const sel = pack.rules.filter((r) => r.tier !== "optional" || r.group).map((r) => ({ id: r.id, params: {} }));
    const { plan } = await prepare(phone, pack, pf.device, sel, quiet);
    const logs: string[] = [];
    const diag: ExecDiag = { snaps: [] };
    const result = await inspect(phone, plan, (_, t) => logs.push(t), diag);
    const after = switchStates(ui);
    // 荣耀的「显示系统程序」只是多列出几个应用，不算改设置。
    for (const k of Object.keys(before)) expect(after[k], k).toBe(before[k]);
    expect(ui.picked).toEqual([]);
    expect(JSON.stringify(phone.s.settings)).toBe(settingsBefore);
    expect(phone.s.suspended).toEqual(state.suspended);
    for (const r of brandPack.rules.filter((r) => r.executor === "ui")) {
      expect(result[r.id].problems, `${r.id}\n${logs.join("\n")}`).toBe(0);
      expect(result[r.id].changes, r.id).toBeGreaterThan(0);
    }
    expect(diag.snaps.some((x) => x.note.startsWith("检查："))).toBe(true);
    if (name === "oppo") expect(result["oppo-ui-adtrack"].changes).toBe(12); // 翻页重叠的行不重复计数
  });
});
