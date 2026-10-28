// 荣耀（MagicOS）去广告配方。
// 移植自 android-ad-cleaner 的 recipes/honor-PNM-AN10 和 docs/清单/荣耀-MagicOS.md（MIT），原脚本在 PNM-AN10（MagicOS 10）实测。
// 没有移植的部分：靠设置搜索框输入的两项（YOYO 建议、魔法画报）、音乐和阅读（依赖原版的控件选择器）、
// 应用市场切「基本服务」（切回要重新同意协议，协议会重新打开个性化推荐）。

import { Ui } from "../ui";

export const honor: Record<string, (ui: Ui) => Promise<void>> = {
  async 广告跟踪(ui) {
    if (!(await ui.settingsPage("隐私和安全", "其他隐私和安全功能", "广告与隐私"))) return;
    // 右上「更多选项」→ 显示系统程序 → 再点「更多选项」→ 全部关闭
    if (await ui.tap("更多选项", { exact: false, scrolls: 0 })) {
      if (ui.find(await ui.tree(), "显示系统程序", true)) {
        await ui.tap("显示系统程序", { scrolls: 0 });
        await ui.tap("更多选项", { exact: false, scrolls: 0 });
      }
      if (await ui.choose("全部关闭")) {
        await ui.confirm();
        if (!ui.dryRun) ui.changed.push({ page: "系统 · 广告与隐私", title: "所有应用的广告标识读取（全部关闭）", to: false });
      }
    }
    await ui.start("com.hihonor.id", ".oaid.ui.IntelligentRecommendActivity");
    await ui.off({ page: "系统 · 智能推荐服务" });
  },

  async 下拉搜索(ui) {
    await ui.home();
    await ui.pullDown();
    // 键盘收起后，搜索框旁的「更多」位置才固定。
    const more = ui.texts(await ui.tree()).filter((x) => x.text === "更多" && x.n.b[1] > ui.H * 0.3).pop();
    if (!more) throw new Error("找不到搜索框旁的「更多」");
    await ui.click(Math.round((more.n.b[0] + more.n.b[2]) / 2), Math.round((more.n.b[1] + more.n.b[3]) / 2));
    await ui.sleep(600);
    await ui.tap("设置", { scrolls: 0 });
    if (await ui.maybe("首页显示")) {
      await ui.off({ only: ["热搜榜", "热搜词推荐"], page: "下拉搜索 · 首页显示" });
      await ui.back();
    }
    if (await ui.maybe("个性化管理")) {
      await ui.off({ page: "下拉搜索 · 个性化管理" });
      await ui.back();
    }
    await ui.back(2);
  },

  async 负一屏(ui) {
    await ui.home();
    for (let i = 0; i < 3 && !ui.find(await ui.tree(), "头像", true); i++) await ui.swipeRight();
    await ui.tap("头像", { scrolls: 0 });
    await ui.tap("设置", { scrolls: 0 });
    await ui.off({ only: ["智能推荐", "个性化广告", "个性化消息"], page: "负一屏 · 设置" });
    if (await ui.maybe("资讯服务", 0)) {
      await ui.off({ only: ["资讯精选"], page: "负一屏 · 资讯服务" });
      await ui.back();
    }
    await ui.back(3);
  },

  async 桌面文件夹(ui) {
    // 「精品应用」「热门推荐」文件夹底部推荐没装的应用。
    await ui.start("com.hihonor.appmarket", ".module.topapps.TopAppsSettingActivity");
    await ui.off({ page: "精品应用 · 更多推荐" });
    await ui.start("com.hihonor.appmarket", ".popularapps.activity.PopularAppsSettingActivity");
    await ui.off({ page: "热门推荐管理" });
    await ui.back(2);
  },

  async 应用市场(ui) {
    await ui.start("com.hihonor.appmarket");
    const nodes = await ui.tree();
    if (ui.find(nodes, "基本服务", true, "tab") && !ui.find(nodes, "我的", true, "tab")) {
      ui.log("应用市场已经是基本服务模式（没有推荐），跳过");
      return;
    }
    await ui.tap("我的", { scrolls: 0 });
    await ui.tap("设置", { scrolls: 0 });
    if (await ui.maybe("内容推荐服务")) {
      // 两个开关要分开点，连着点第二个会失效。
      await ui.off({ only: ["营销服务推荐"], page: "应用市场 · 内容推荐服务" });
      await ui.off({ only: ["个性化服务推荐"], page: "应用市场 · 内容推荐服务" });
      await ui.back();
    }
    if (await ui.maybe("消息通知管理")) {
      await ui.off({ only: ["消息通知"], keep: ["应用更新"], page: "应用市场 · 消息通知管理" });
      await ui.back();
    }
    if (await ui.maybe("消息中心提醒")) {
      await ui.off({ only: ["活动福利", "游戏动态"], page: "应用市场 · 消息中心提醒" });
      await ui.back();
    }
    await ui.back(2);
  },

  async 浏览器(ui) {
    if (!(await ui.run("pm path com.honor.browser")).out.includes("package:")) {
      ui.log("这台手机预装的是百度版浏览器，暂不支持，跳过");
      return;
    }
    await ui.start("com.honor.browser");
    if (ui.find(await ui.tree(), "我的", true, "tab")) {
      // 经典首页：我的 → 右上第三个图标
      await ui.tap("我的", { scrolls: 0 });
      if (!(await ui.tapRid("top_local_icon", 2))) throw new Error("没找到浏览器设置图标");
    } else {
      await ui.tap("更多", { scrolls: 0 });
      await ui.tap("设置", { scrolls: 0 });
    }
    if (await ui.maybe("模式选择")) {
      await ui.choose("简洁首页");
      await ui.back();
    }
    if (await ui.maybe("消息通知")) {
      await ui.off({ only: ["新闻热点", "兴趣推送"], page: "浏览器 · 消息通知" });
      await ui.back();
    }
    if (await ui.maybe("隐私管理")) {
      if (await ui.maybe("个性化推荐", 0)) {
        await ui.off({ only: ["个性化内容"], page: "浏览器 · 个性化推荐" });
        await ui.back();
      }
      if (await ui.maybe("互动广告管理", 0)) {
        await ui.off({ page: "浏览器 · 互动广告管理" });
        await ui.back();
      }
      await ui.back();
    }
    await ui.back(2);
  },

  async 主题(ui) {
    await ui.start("com.hihonor.android.thememanager");
    await ui.tap("我的", { scrolls: 0 });
    await ui.tap("设置");
    if (await ui.maybe("通知", 0)) {
      await ui.off({ page: "主题 · 通知" }); // 三项都是「内容推荐和活动信息」
      await ui.back();
    }
    if (await ui.maybe("个性化服务", 0)) {
      await ui.off({ page: "主题 · 个性化服务" });
      await ui.back();
    }
    await ui.back(3);
  },

  async 视频(ui) {
    await ui.start("com.hihonor.youku.video", "com.youku.android.youkusetting.activity.SettingsActivity");
    if (await ui.maybe("其他设置")) await ui.off({ only: ["个性化内容", "个性化广告", "OAID"], page: "视频 · 其他设置" });
    await ui.back(2);
  },

  async 系统管家(ui) {
    await ui.start("com.hihonor.systemmanager", ".mainscreen.SettingActivity");
    await ui.off({ only: ["应用推荐"], page: "系统管家 · 设置" }); // 清理、查杀、拦截不动
    await ui.back();
  },
};
