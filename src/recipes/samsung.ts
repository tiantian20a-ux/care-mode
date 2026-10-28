// 三星（One UI）去广告配方。
// android-ad-cleaner 没有三星的实测清单，路径按公开教程（One UI 5 前后）整理，没有在真机上验证过。
// 中文和英文界面都试一遍，找不到就跳过。推广通知交给通用的「关闭营销类通知」。

import { Ui } from "../ui";

export const samsung: Record<string, (ui: Ui) => Promise<void>> = {
  async 定制服务(ui) {
    for (const path of [["隐私", "定制服务"], ["Privacy", "Customization Service"]]) {
      if (await ui.settingsPage(...path)) {
        await ui.off({ only: ["广告", "营销", "ads", "marketing"], page: "系统 · 定制服务" });
        return;
      }
    }
  },

  async 三星账户(ui) {
    for (const path of [["三星账户", "安全与隐私"], ["Samsung account", "Security and privacy"]]) {
      if (await ui.settingsPage(...path)) {
        await ui.off({ only: ["新闻和特别优惠", "个性化广告", "news and special offers", "personalized ads"], page: "三星账户 · 安全与隐私" });
        return;
      }
    }
  },

  async 应用商店(ui) {
    await ui.start("com.sec.android.app.samsungapps");
    if (!(await ui.tapAny("菜单", "Menu"))) return;
    await ui.gear(true);
    if (await ui.tapAny("定制服务", "Customization Service")) {
      await ui.off({ page: "Galaxy Store · 定制服务" });
      await ui.back();
    }
    await ui.back(3);
  },
};
