// 华为（EMUI / HarmonyOS 4 及以下）去广告配方。
// android-ad-cleaner 没有华为的实测清单，路径按公开教程整理，没有在真机上验证过。
// 不同版本入口名称差别大，找不到就跳过。HarmonyOS NEXT 不是安卓，用不了 ADB，不支持。

import { Ui } from "../ui";

export const huawei: Record<string, (ui: Ui) => Promise<void>> = {
  async 广告与隐私(ui) {
    // 「限制广告追踪」是保护类开关，会被打开；「更多信息」里关智能推荐服务。
    for (const path of [["隐私", "广告与隐私"], ["安全和隐私", "广告与隐私"], ["隐私和安全", "广告与隐私"]]) {
      if (await ui.settingsPage(...path)) {
        await ui.off({ page: "系统 · 广告与隐私" });
        if (await ui.maybe("更多信息", 0)) {
          await ui.off({ only: ["智能推荐"], page: "系统 · 广告与隐私 · 更多信息" });
          await ui.back();
        }
        return;
      }
    }
  },

  async 智慧助手(ui) {
    if (!(await ui.settingsPage("智慧助手"))) return;
    if (await ui.maybe("智慧搜索")) {
      await ui.off({ only: ["实时热点", "热搜"], page: "智慧搜索" });
      if (await ui.maybe("高级设置", 0)) {
        await ui.off({ only: ["个性化推荐", "个性化广告"], page: "智慧搜索 · 高级设置" });
        await ui.back();
      }
      await ui.back();
    }
    if (await ui.maybe("今天")) {
      if (await ui.maybe("设置", 0)) {
        await ui.off({ only: ["广告", "个性化推荐", "资讯"], page: "智慧助手 · 今天" });
        await ui.back();
      }
      await ui.back();
    }
  },

  async 浏览器(ui) {
    await ui.start("com.huawei.browser");
    await ui.go("我的", "设置");
    await ui.gear();
    if (await ui.maybe("消息通知")) {
      await ui.off({ only: ["资讯", "热点", "推荐"], keep: ["下载"], page: "浏览器 · 消息通知" });
      await ui.back();
    }
    if (await ui.maybe("安全与隐私")) {
      await ui.off({ only: ["个性化内容", "个性化推荐"], keep: ["保存密码"], page: "浏览器 · 安全与隐私" });
      await ui.back();
    }
    if (await ui.maybe("个性化广告")) {
      await ui.off({ page: "浏览器 · 个性化广告" });
      await ui.back();
    }
    await ui.back(2);
  },
};
