// 小米 / Redmi / POCO（HyperOS、MIUI）去广告配方。
// 移植自 android-ad-cleaner 的 recipes/xiaomi-M154FF/recipe.py 和 docs/清单/小米-HyperOS.md（MIT）。
// 原脚本在 Xiaomi 18 Pro Max（OS4.0.24）实测，Xiaomi 18 Fold 社区实测。新旧版 App 入口都兼容，找不到就跳过。

import { Ui } from "../ui";

/** 浏览器：先看顶部工具栏的齿轮，再点底部「我的」；不把资讯正文里的「我的」当导航。 */
async function browserSettings(ui: Ui): Promise<boolean> {
  if (await ui.gear(true)) return true;
  for (const { text, n } of ui.texts(await ui.tree())) {
    if (text === "我的" && n.b[1] >= ui.H * 0.65) {
      await ui.click(Math.round((n.b[0] + n.b[2]) / 2), Math.round((n.b[1] + n.b[3]) / 2));
      await ui.sleep(1500);
      return ui.gear();
    }
  }
  return false;
}

const HOT = ["推荐", "微博", "资讯", "全网", "影视", "音乐", "小说", "知乎", "精选"];

export const xiaomi: Record<string, (ui: Ui) => Promise<void>> = {
  async 系统广告(ui) {
    // 不用设置里的搜索：HyperOS 搜索框输入中文会卡住。按菜单路径点进去。
    await ui.run("am start -f 0x10008000 -a android.settings.SETTINGS");
    await ui.sleep(1500);
    if (!(await ui.maybe("隐私与安全"))) return;
    if (!(await ui.maybe("更多安全设置")) && (await ui.maybe("安全", 3))) await ui.maybe("更多安全设置");
    if (await ui.maybe("广告服务")) await ui.off({ only: ["个性化广告推荐"], page: "系统 · 广告服务" });
  },

  async 应用商店(ui) {
    await ui.start("com.xiaomi.market");
    await ui.go("我的", "设置");
    await ui.gear();
    if (await ui.tapAny("隐私设置", "隐私")) {
      // 新版商店的「个性化服务」是子页入口，开关在下一层。
      const nested = !ui.switches(await ui.tree()).some((s) => s.title.includes("个性化服务"));
      if (!nested || (await ui.maybe("个性化服务"))) {
        await ui.off({ only: ["个性化服务"], page: "应用商店 · 个性化服务" });
        if (nested) await ui.back();
      }
      await ui.back();
    }
    if (await ui.maybe("模式切换")) {
      // 新版商店没有这一项
      await ui.tap("极简模式", { scrolls: 0 });
      await ui.confirm();
      await ui.back();
    }
    if (await ui.maybe("通知设置")) {
      // 不碰「推送消息」：它是父开关，关了会连「点赞消息」「评论消息」一起关。
      await ui.off({ only: ["新手帮助"], keep: ["推送消息", "应用更新"], page: "应用商店 · 通知设置" });
      await ui.back();
    }
    await ui.back(2);
  },

  async 手机管家(ui) {
    await ui.start("com.miui.securitycenter", "com.miui.securityscan.ui.settings.SettingsActivity");
    if (await ui.maybe("隐私设置")) {
      await ui.off({ only: ["个性化推荐"], page: "手机管家 · 隐私设置" });
      await ui.back();
    }
    if (await ui.maybe("垃圾清理")) {
      await ui.off({ only: ["推荐内容"], page: "手机管家 · 垃圾清理" });
      await ui.back();
    }
    await ui.back(2);
  },

  async 下载管理(ui) {
    await ui.start("com.android.providers.downloads.ui");
    if (!(await ui.gear())) throw new Error("没找到下载管理的设置入口");
    if (await ui.maybe("信息流设置")) await ui.off({ only: ["资源推荐", "热榜推荐"], page: "下载管理 · 信息流设置" });
    await ui.back(3);
  },

  async 主题(ui) {
    // HyperOS 4 桌面入口是 themestore，打开后转到 thememanager。
    if ((await ui.run("pm path com.miui.themestore")).out.includes("package:")) {
      await ui.start("com.miui.themestore", undefined, "com.android.thememanager");
    } else await ui.start("com.android.thememanager");
    await ui.go("我的", "设置");
    await ui.gear();
    await ui.off({ only: ["每次联网时通知"], keep: ["自动更新"], page: "主题 · 设置" });
    if (await ui.maybe("隐私设置")) {
      await ui.off({ only: ["个性化推荐"], page: "主题 · 隐私设置" });
      await ui.back();
    }
    await ui.back(2);
  },

  async 浏览器(ui) {
    // 主页样式（探索版 / 自定义主页）不改，按机主喜好。
    await ui.start("com.android.browser");
    if (!(await browserSettings(ui))) throw new Error("没找到浏览器的设置入口");
    if (await ui.maybe("隐私和安全")) {
      await ui.off({ only: ["个性化内容推荐", "个性化广告推荐"], page: "浏览器 · 隐私和安全" });
      await ui.back();
    }
    for (const [page, only] of [
      ["主页设置", ["宫格位推送"]],
      ["搜索设置", ["猜你想搜"]],
      ["功能设置", ["小说"]],
    ] as const) {
      // 新版浏览器没有这三项，有就关
      if (await ui.maybe(page)) {
        await ui.off({ only: [...only], page: `浏览器 · ${page}` });
        await ui.back();
      }
    }
    await ui.back(2);
  },

  async 全局搜索(ui) {
    await ui.start("com.android.quicksearchbox", ".preferences.SearchSettingsPreferenceActivity");
    if (!(await ui.maybe("首页展示模块"))) return;
    await ui.off({ only: ["搜索提示词"], page: "全局搜索 · 首页展示模块" });
    if (await ui.maybe("应用推荐")) {
      await ui.off({ only: ["推荐未安装应用"], keep: ["展示常用应用"], page: "全局搜索 · 应用推荐" });
      await ui.back();
    }
    if (await ui.maybe("热搜榜单")) {
      // 老机型同一页既有「推荐」开关又有热搜/生活/话题子页，两种都处理。
      const nodes = await ui.tree();
      const subs = ["热搜", "生活", "话题", "娱乐"].filter((x) => ui.find(nodes, x, true));
      if (ui.switches(nodes).length) await ui.off({ only: HOT, page: "全局搜索 · 热搜榜单" });
      if (subs.length) {
        await ui.top();
        for (const x of subs) {
          if (await ui.maybe(x)) {
            await ui.off({ only: HOT, page: `全局搜索 · 热榜 · ${x}` });
            await ui.back();
          }
        }
      }
      await ui.back();
    }
    await ui.back(3);
  },

  async 负一屏(ui) {
    await ui.start("com.miui.personalassistant", ".settings.PASettingActivity");
    await ui.off({ only: ["推荐卡片", "热门活动"], page: "负一屏 · 设置" }); // 搜索框、出行助手保留
    if (await ui.maybe("隐私设置")) {
      await ui.off({ only: ["个性化推荐"], page: "负一屏 · 隐私设置" });
      await ui.back();
    }
    await ui.back();
  },

  async 天气和日历(ui) {
    for (const pkg of ["com.miui.weather2", "com.android.calendar"]) {
      try {
        await ui.start(pkg);
      } catch (e) {
        ui.log(`${(e as Error).message}`);
        continue;
      }
      // 新版天气：底部「城市管理」→ 右上更多 → 设置
      if (pkg === "com.miui.weather2" && ui.find(await ui.tree(), "城市管理", true, "tab")) await ui.tap("城市管理", { scrolls: 0 });
      if (!(await ui.gear())) {
        ui.log("这个版本没有能识别的设置菜单，跳过");
        continue;
      }
      if (await ui.maybe("用户体验计划")) {
        // 天气预警、异常天气提醒保留
        await ui.off({ only: ["推荐", "广告", "个性化", "内容推广", "天气视频卡片"], page: `${pkg === "com.miui.weather2" ? "天气" : "日历"} · 用户体验计划` });
        await ui.back();
      }
      await ui.back(3);
    }
  },
};
