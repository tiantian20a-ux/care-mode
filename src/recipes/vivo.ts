// vivo / iQOO（OriginOS）去广告配方。
// 移植自 android-ad-cleaner 的 recipes/vivo-V2547DA 和 docs/清单/vivo-OriginOS.md（MIT）。
// 原路径在 vivo X300 Ultra（OriginOS 6）手动实测，整段自动执行还没有真机验证过。

import { Ui } from "../ui";

export const vivo: Record<string, (ui: Ui) => Promise<void>> = {
  async 系统广告(ui) {
    if (!(await ui.settingsPage())) return;
    if (!(await ui.tapAny("安全", "安全与隐私"))) return;
    if ((await ui.maybe("更多安全设置")) && (await ui.maybe("广告与隐私"))) {
      await ui.off({ only: ["个性化广告", "个性化推荐", "智能推荐服务"], page: "系统 · 广告与隐私" });
    }
  },

  async 全局搜索(ui) {
    if (!(await ui.settingsPage("系统管理与升级", "全局搜索"))) return;
    if (await ui.maybe("首页展示内容")) {
      await ui.off({ only: ["搜索框推荐词", "推荐卡片"], page: "全局搜索 · 首页展示内容" });
      await ui.back();
    }
    if (await ui.maybe("推荐热搜榜单")) {
      await ui.off({ only: ["热门搜索"], page: "全局搜索 · 推荐热搜榜单" });
      await ui.back();
    }
    if (await ui.maybe("个性化内容")) {
      // 历史记录、应用建议、搜索结果个性化保留
      await ui.off({ only: ["广告个性化"], page: "全局搜索 · 个性化内容" });
      await ui.back();
    }
  },

  async 负一屏(ui) {
    await ui.home();
    await ui.swipeRight();
    if (!(await ui.gear(true))) throw new Error("没找到负一屏的设置");
    if ((await ui.maybe("更多设置")) && (await ui.maybe("个性化推荐"))) {
      // 「便捷生活 → 推荐服务」不关：常用工具图标靠它补位。小V建议（航班、快递）保留。
      await ui.off({ only: ["服务推荐", "资讯推荐", "内容精选", "热点资讯"], keep: ["小V建议", "推荐服务"], page: "负一屏 · 个性化推荐" });
    }
    await ui.back(3);
  },

  async 阅图锁屏(ui) {
    if (await ui.settingsPage("桌面、锁屏与壁纸", "锁屏设置", "阅图锁屏")) {
      await ui.off({ only: ["阅图锁屏", "锁屏横滑进入阅图"], page: "阅图锁屏" });
    }
  },

  async 应用商店(ui) {
    await ui.start("com.bbk.appstore");
    await ui.go("我的", "设置");
    await ui.gear();
    if (await ui.maybe("关于")) {
      await ui.off({ only: ["个性化推荐"], page: "应用商店 · 关于" });
      await ui.back();
    }
    if (await ui.maybe("服务管理")) {
      await ui.off({ only: ["签到有礼", "顶部轮播图", "顶部栏目", "开屏", "摇一摇", "悬浮窗", "限时推广"], keep: ["我的服务", "空间清理"], page: "应用商店 · 服务管理" });
      await ui.back();
    }
    await ui.back(2);
  },

  async 浏览器(ui) {
    await ui.start("com.vivo.browser");
    await ui.go("我的", "设置");
    await ui.gear();
    if (await ui.maybe("首页设置")) {
      await ui.maybe("极简首页", 0);
      await ui.off({ only: ["首页上滑展示资讯"], page: "浏览器 · 首页设置" });
      await ui.back();
    }
    if (await ui.maybe("隐私权限设置")) {
      await ui.off({ only: ["个性化内容", "第三方应用来源个性化推荐"], page: "浏览器 · 隐私权限设置" });
      await ui.back();
    }
    if (await ui.maybe("网页浏览设置")) {
      await ui.off({ only: ["网页下载相关推荐"], page: "浏览器 · 网页浏览设置" });
      await ui.back();
    }
    if (await ui.maybe("更多设置")) {
      await ui.off({ only: ["跳转新闻资讯"], page: "浏览器 · 更多设置" });
      await ui.back();
    }
    await ui.back(2);
  },

  async i管家(ui) {
    await ui.start("com.iqoo.secure");
    await ui.gear();
    if ((await ui.maybe("关于")) && (await ui.maybe("个性化设置"))) await ui.off({ only: ["应用个性化推荐"], page: "i管家 · 个性化设置" });
    await ui.back(3);
  },

  async 天气(ui) {
    await ui.start("com.vivo.weather");
    await ui.gear();
    if (await ui.maybe("天气服务")) {
      // 气象预警、异常天气、地震预警保留，只关热点资讯通知。
      await ui.off({ only: ["热点资讯"], keep: ["预警", "异常天气"], page: "天气 · 天气服务" });
      await ui.back();
    }
    await ui.back(2);
  },
};
