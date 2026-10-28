// 魅族（Flyme）去广告配方。
// android-ad-cleaner 没有魅族的实测清单，路径按 Flyme 8 时期的公开教程整理，新版可能不同，没有在真机上验证过。
// 魅族自带应用大多有同名的「精选内容推送」开关，找不到入口就跳过。

import { Ui } from "../ui";

const PUSH = ["精选内容推送", "精选应用推荐"];

/** 打开应用的设置：先找右上角齿轮，没有就点头像或「我的」再找。 */
async function appSettings(ui: Ui, pkg: string): Promise<boolean> {
  await ui.start(pkg);
  if (await ui.gear(true)) return true;
  if (await ui.tapAny("头像", "我的", "个人中心")) return ui.gear();
  return false;
}

async function simple(ui: Ui, pkg: string, page: string, only: string[], keep: string[] = []) {
  if (!(await appSettings(ui, pkg))) throw new Error(`没找到${page}的设置`);
  await ui.off({ only, keep, page });
  await ui.back(3);
}

export const meizu: Record<string, (ui: Ui) => Promise<void>> = {
  async 全局搜索(ui) {
    if (await ui.settingsPage("辅助功能", "全局搜索")) {
      await ui.off({ only: ["资讯头条", "显示热词", ...PUSH], keep: ["最近使用"], page: "全局搜索" });
    }
  },

  async 天气(ui) {
    await simple(ui, "com.meizu.flyme.weather", "天气", ["本地资讯", "开屏推荐", ...PUSH], ["预警"]);
  },

  async 应用商店(ui) {
    await simple(ui, "com.meizu.mstore", "应用商店", PUSH, ["自动更新"]);
  },

  async 浏览器(ui) {
    await simple(ui, "com.android.browser", "浏览器", PUSH, ["保存密码"]);
  },

  async 主题美化(ui) {
    await simple(ui, "com.meizu.customizecenter", "主题美化", PUSH);
  },

  async 手机管家(ui) {
    if (!(await appSettings(ui, "com.meizu.safe"))) throw new Error("没找到手机管家的设置");
    if (await ui.maybe("智能卡片")) {
      await ui.off({ only: ["应用推荐下载", "安全播报"], page: "手机管家 · 智能卡片" });
      await ui.back();
    }
    await ui.back(3);
  },

  async 视频(ui) {
    await simple(ui, "com.meizu.media.video", "视频", ["开屏广告", "推荐在线内容", ...PUSH]);
  },
};
