// OPPO / 一加 / realme（ColorOS）去广告配方。
// 移植自 android-ad-cleaner 的 recipes/oppo-PLP120、recipes/oneplus-PJA110 和 docs/清单/OPPO-ColorOS.md（MIT）。
// 原路径在 OPPO Find N6（ColorOS 16.0.9）、一加 Ace 2 Pro（ColorOS 14）上实测，其余机型入口可能不同，找不到就跳过。

import { Ui } from "../ui";

/** 开关可能直接在这一页，也可能在同名的二级页里（一加 ColorOS 14 的商店）。 */
async function offMaybeNested(ui: Ui, name: string, page: string) {
  const here = ui.switches(await ui.tree()).some((s) => s.title.includes(name));
  if (here) {
    await ui.off({ only: [name], page });
    return;
  }
  if (await ui.maybe(name)) {
    await ui.off({ only: [name], page });
    await ui.back();
  }
}

// 商店「服务管理」里要保留的功能项，其余推广位全关。
const STORE_KEEP = ["帮助与客服", "应用安全", "应用工具", "存储空间清理", "我的资产", "安全守护", "小i客服", "应用使用记录", "AI 搜索", "自动检测风险应用", "下载", "更新"];

export const oppo: Record<string, (ui: Ui) => Promise<void>> = {
  async 广告跟踪(ui) {
    // 每个应用一个开关，没有总开关；新装的应用默认打开。ColorOS 17 首页改叫「隐私与安全」，ColorOS 14 叫「权限与隐私」。
    for (const first of ["隐私", "隐私与安全", "权限与隐私"]) {
      const path = first === "权限与隐私" ? [first, "隐私", "设备标识与广告", "广告跟踪"] : [first, "设备标识与广告", "广告跟踪"];
      if (await ui.settingsPage(...path)) {
        await ui.off({ page: "系统 · 广告跟踪", maxScreens: 40 });
        return;
      }
    }
  },

  async 负一屏(ui) {
    await ui.home();
    for (let i = 0; i < 3 && !(await ui.focus()).includes("assistantscreen"); i++) await ui.swipeRight();
    if (!(await ui.focus()).includes("assistantscreen")) throw new Error("没打开负一屏");
    // 左上头像 → 设置
    const av = ui.texts(await ui.tree()).find((x) => x.text.includes("头像"));
    if (av) await ui.click(Math.round((av.n.b[0] + av.n.b[2]) / 2), Math.round((av.n.b[1] + av.n.b[3]) / 2));
    await ui.sleep(1000);
    await ui.tap("设置", { scrolls: 0 });
    await ui.off({ only: ["搜索框提示词", "热点资讯"], keep: ["服务动态", "快捷服务"], page: "负一屏 · 设置" });
    // 不关「推荐服务」总开关：会连天气、步数、清理卡片一起删掉。只把轮播推荐设成不显示。
    if (await ui.maybe("推荐服务")) {
      if (await ui.maybe("轮播推荐")) {
        await ui.choose("不显示");
        await ui.back();
      }
      await ui.back();
    }
    await ui.back(2);
  },

  async 下拉搜索(ui) {
    await ui.home();
    await ui.pullDown();
    if (!(await ui.focus()).startsWith("com.heytap.quicksearchbox")) throw new Error("没打开下拉搜索");
    // 搜索页底部的「设置」；搜索设置页不要往下拉，会退出。
    if (!(await ui.maybe("设置"))) return;
    if (await ui.maybe("搜索范围")) {
      // 「APP内搜索」必须开着，关了搜不到本机应用。
      await ui.off({ only: ["榜单", "小说", "购物", "个性化推荐", "精选资讯"], keep: ["APP内搜索", "搜索建议", "小程序", "AI 搜索", "便捷服务"], page: "下拉搜索 · 搜索范围" });
      await ui.back();
    }
    if (await ui.maybe("首页卡片管理")) {
      await ui.off({ only: ["未下载应用推荐", "应用建议小卡", "探索发现", "活动皮肤", "热搜应用", "精选推荐", "热搜榜单", "推荐卡片"], keep: ["本机资产推荐"], page: "下拉搜索 · 首页卡片管理" });
      await ui.back();
    }
    if (await ui.maybe("功能管理")) {
      await ui.off({ only: ["搜索框提示词"], page: "下拉搜索 · 功能管理" });
      await ui.back();
    }
    if ((await ui.maybe("账号与隐私")) && (await ui.maybe("隐私"))) {
      await ui.off({ only: ["个性化推荐"], page: "下拉搜索 · 隐私" });
      await ui.back(2);
    }
    await ui.back(2);
  },

  async 软件商店(ui) {
    await ui.start("com.heytap.market");
    await ui.go("我的", "设置");
    await ui.tap("设置", { scrolls: 0 });
    if (await ui.maybe("隐私")) {
      await offMaybeNested(ui, "个性化推荐", "软件商店 · 隐私");
      await ui.back();
    }
    if (await ui.maybe("服务管理")) {
      await ui.off({ keep: STORE_KEEP, page: "软件商店 · 服务管理", maxScreens: 8 });
      await ui.back();
    }
    await ui.back(2);
  },

  async 浏览器(ui) {
    await ui.start("com.heytap.browser");
    const nodes = await ui.tree();
    if (ui.find(nodes, "我的", true, "tab")) {
      await ui.go("我的", "设置");
      await ui.tap("设置", { scrolls: 0 });
    } else if (ui.find(nodes, "菜单") || ui.find(nodes, "更多")) {
      if (!(await ui.tap("菜单", { exact: false, scrolls: 0 }))) await ui.tap("更多", { exact: false, scrolls: 0 });
      await ui.tap("设置", { exact: false, scrolls: 0 });
    } else {
      // 首页是「简洁」时没有「我的」和菜单：浏览器在前台时可以直接打开设置页。
      await ui.run("am start -n com.heytap.browser/.settings.component.BrowserPreferencesPage");
      await ui.sleep(1200);
      if (!(await ui.focus()).startsWith("com.heytap.browser")) throw new Error("浏览器设置页没有打开");
    }
    if (await ui.maybe("主页设置")) {
      if (await ui.maybe("页面布局")) {
        await ui.choose("简洁");
        await ui.back();
      }
      await ui.back();
    }
    if (await ui.maybe("隐私")) {
      await ui.off({ only: ["个性化推荐"], page: "浏览器 · 隐私" });
      if (await ui.maybe("广告管理")) {
        await ui.off({ only: ["开屏广告", "资讯列表广告", "摇一摇"], page: "浏览器 · 广告管理" });
        await ui.back();
      }
      await ui.back();
    }
    await ui.back(2);
  },

  async 主题商店(ui) {
    await ui.start("com.heytap.themestore");
    await ui.go("我的", "设置");
    await ui.tap("设置", { scrolls: 0 });
    if ((await ui.maybe("服务管理")) && (await ui.maybe("消息与广告"))) {
      await ui.off({ only: ["消息通知", "开屏广告"], page: "主题商店 · 消息与广告" });
      await ui.back(2);
    }
    if ((await ui.maybe("隐私")) && (await ui.maybe("个性化推荐设置"))) {
      await ui.off({ only: ["个性化推荐"], page: "主题商店 · 个性化推荐" });
      await ui.back(2);
    }
    await ui.back(2);
  },

  async 视频(ui) {
    await ui.start("com.heytap.yoli");
    await ui.go("我的", "设置");
    await ui.tap("设置");
    if (await ui.maybe("个性化内容管理")) await ui.off({ only: ["个性化推荐"], page: "视频 · 个性化内容管理" });
    await ui.back(3);
  },

  async 游戏中心(ui) {
    await ui.start("com.nearme.gamecenter");
    await ui.go("我的", "设置");
    await ui.tap("设置");
    if ((await ui.maybe("隐私开关设置")) && (await ui.maybe("个性化推荐管理"))) await ui.off({ only: ["个性化推荐"], page: "游戏中心 · 个性化推荐" });
    await ui.back(4);
  },

  async 小布建议(ui) {
    // 快递、航班、日程提醒和商圈服务保留，只关资讯。
    if (await ui.settingsPage("OPPO AI", "小布建议", "内容资讯")) await ui.off({ only: ["资讯服务"], page: "小布建议 · 内容资讯" });
  },
};
