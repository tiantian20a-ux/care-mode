// 按 android-ad-cleaner 的 OPPO、vivo、荣耀清单搭的模拟应用，用于自动测试和演示模式。

import { FakeUi, type FakeItem, type FakePage } from "./fake-ui";
import { demoState, type FakeState } from "./fake-phone";

const s = (text: string, on = true): FakeItem => ({ text, on });
const l = (text: string, to: string): FakeItem => ({ text, to });
const pick = (text: string): FakeItem => ({ text, pick: true });
const tab = (text: string, to?: string): FakeItem => ({ text, tab: true, to });

function build(pages: Record<string, FakePage>, launchers: Record<string, string>, gestures: FakeUi["gestures"]) {
  const ui = new FakeUi({ none: { pkg: "com.android.settings", act: ".SubSettings", title: "空", items: [] }, ...pages }, { "com.android.settings": "settings", ...launchers });
  ui.gestures = gestures;
  return ui;
}

export function fakeOppoApps(): FakeUi {
  const S = "com.android.settings";
  return build(
    {
      settings: { pkg: S, act: ".Settings", title: "设置", items: [l("WLAN", "none"), l("隐私", "privacy"), l("OPPO AI", "ai")] },
      privacy: { pkg: S, act: ".Privacy", title: "隐私", items: [l("权限管理", "none"), l("设备标识与广告", "devid")] },
      devid: { pkg: S, act: ".DevId", title: "设备标识与广告", items: [l("广告跟踪", "adtrack")] },
      adtrack: { pkg: S, act: ".AdTrack", title: "广告跟踪", items: ["支付宝", "淘宝", "抖音", "快手", "京东", "美团", "拼多多", "微博", "小红书", "百度", "高德地图", "今日头条"].map((x) => s(x)) },
      ai: { pkg: S, act: ".Ai", title: "OPPO AI", items: [l("小布建议", "breeno")] },
      breeno: { pkg: S, act: ".Breeno", title: "小布建议", items: [l("内容资讯", "breenoNews"), s("快递提醒"), s("航班提醒")] },
      breenoNews: { pkg: S, act: ".BreenoNews", title: "内容资讯", items: [s("资讯服务"), s("商圈服务")] },

      assistant: { pkg: "com.coloros.assistantscreen", act: ".view.AssistantActivity", title: "速览", items: [l("头像", "paSettings"), l("步数卡片", "none")] },
      paSettings: { pkg: "com.coloros.assistantscreen", act: ".Me", title: "我的", items: [l("设置", "paSettings2")] },
      paSettings2: { pkg: "com.coloros.assistantscreen", act: ".Settings2", title: "负一屏设置", items: [s("搜索框提示词"), s("热点资讯"), s("服务动态"), s("快捷服务"), { text: "推荐服务", to: "paRec" }] },
      paRec: { pkg: "com.coloros.assistantscreen", act: ".Rec", title: "推荐服务", items: [l("轮播推荐", "paCarousel")] },
      paCarousel: { pkg: "com.coloros.assistantscreen", act: ".Carousel", title: "轮播推荐", items: [pick("显示"), pick("不显示")] },

      qs: { pkg: "com.heytap.quicksearchbox", act: ".ui.SearchActivity", title: "搜索", keyboard: true, items: [l("最近搜索", "none"), l("设置", "qsSettings")] },
      qsSettings: { pkg: "com.heytap.quicksearchbox", act: ".Settings", title: "搜索设置", items: [l("搜索范围", "qsScope"), l("首页卡片管理", "qsCards"), l("功能管理", "qsFunc"), l("账号与隐私", "qsAccount")] },
      qsScope: { pkg: "com.heytap.quicksearchbox", act: ".Scope", title: "搜索范围", items: [s("APP内搜索"), s("搜索建议"), s("榜单"), s("小说"), s("购物"), s("个性化推荐"), s("精选资讯"), s("小程序"), s("便捷服务")] },
      qsCards: { pkg: "com.heytap.quicksearchbox", act: ".Cards", title: "首页卡片管理", items: [s("应用建议"), s("未下载应用推荐"), s("应用建议小卡"), s("探索发现"), s("活动皮肤"), s("本机资产推荐")] },
      qsFunc: { pkg: "com.heytap.quicksearchbox", act: ".Func", title: "功能管理", items: [s("搜索框提示词")] },
      qsAccount: { pkg: "com.heytap.quicksearchbox", act: ".Account", title: "账号与隐私", items: [l("隐私", "qsPrivacy")] },
      qsPrivacy: { pkg: "com.heytap.quicksearchbox", act: ".Privacy", title: "隐私", items: [s("个性化推荐")] },

      market: { pkg: "com.heytap.market", act: ".MainActivity", title: "软件商店", popup: true, items: [l("开机必备", "none"), tab("首页"), tab("我的", "marketMine")] },
      marketMine: { pkg: "com.heytap.market", act: ".mine.MineActivity", title: "我的", items: [l("设置", "marketSettings")] },
      marketSettings: { pkg: "com.heytap.market", act: ".mine.ui.SettingActivity", title: "设置", items: [l("隐私", "marketPrivacy"), l("服务管理", "marketSvc"), s("自动更新")] },
      marketPrivacy: { pkg: "com.heytap.market", act: ".Privacy", title: "隐私", items: [l("个性化推荐", "marketRec")] },
      marketRec: { pkg: "com.heytap.market", act: ".mine.PersonalRecommendActivity", title: "个性化推荐", items: [s("个性化推荐")] },
      marketSvc: {
        pkg: "com.heytap.market",
        act: ".Svc",
        title: "服务管理",
        items: [s("首页：悬浮活动图标"), s("首页：活动弹窗"), s("首页：顶部轮播卡片"), s("底部活动专区"), s("游戏专区：福利"), s("游戏详情页：游戏活动卡片"), s("帮助与客服"), s("应用安全"), s("存储空间清理"), s("自动检测风险应用"), s("首页 AI 搜索"), s("软件专区：福利")],
      },

      browser: { pkg: "com.heytap.browser", act: "com.android.browser.BrowserActivity", title: "浏览器", items: [l("今日热点", "none"), tab("首页"), tab("我的", "brMine")] },
      brMine: { pkg: "com.heytap.browser", act: ".Mine", title: "我的", items: [l("设置", "brSettings")] },
      brSettings: { pkg: "com.heytap.browser", act: ".settings.component.BrowserPreferencesPage", title: "设置", items: [l("主页设置", "brHome"), l("隐私", "brPrivacy")] },
      brHome: { pkg: "com.heytap.browser", act: ".Home", title: "主页设置", items: [l("页面布局", "brLayout")] },
      brLayout: { pkg: "com.heytap.browser", act: ".Layout", title: "页面布局", items: [pick("资讯"), pick("简洁")] },
      brPrivacy: { pkg: "com.heytap.browser", act: ".Privacy", title: "隐私", items: [s("个性化推荐"), l("广告管理", "brAds"), s("保存密码")] },
      brAds: { pkg: "com.heytap.browser", act: ".Ads", title: "广告管理", items: [s("开屏广告"), s("资讯列表广告"), s("摇一摇广告")] },

      themes: { pkg: "com.heytap.themestore", act: ".Main", title: "主题商店", items: [l("推荐", "none"), tab("我的", "thMine")] },
      thMine: { pkg: "com.heytap.themestore", act: ".Mine", title: "我的", items: [l("设置", "thSettings")] },
      thSettings: { pkg: "com.heytap.themestore", act: ".Settings", title: "设置", items: [l("服务管理", "thSvc"), l("隐私", "thPrivacy")] },
      thSvc: { pkg: "com.heytap.themestore", act: ".Svc", title: "服务管理", items: [l("消息与广告", "thMsg")] },
      thMsg: { pkg: "com.heytap.themestore", act: ".Msg", title: "消息与广告", items: [s("消息通知"), s("开屏广告")] },
      thPrivacy: { pkg: "com.heytap.themestore", act: ".Privacy", title: "隐私", items: [l("个性化推荐设置", "thRec")] },
      thRec: { pkg: "com.heytap.themestore", act: ".Rec", title: "个性化推荐设置", items: [s("个性化推荐")] },

      video: { pkg: "com.heytap.yoli", act: ".Main", title: "视频", items: [l("推荐", "none"), tab("我的", "vMine")] },
      vMine: { pkg: "com.heytap.yoli", act: ".Mine", title: "我的", items: [l("设置", "vSettings")] },
      vSettings: { pkg: "com.heytap.yoli", act: ".Settings", title: "设置", items: [l("个性化内容管理", "vRec")] },
      vRec: { pkg: "com.heytap.yoli", act: ".Rec", title: "个性化内容管理", items: [s("个性化推荐")] },

      games: { pkg: "com.nearme.gamecenter", act: ".Main", title: "游戏中心", items: [l("热门", "none"), tab("我的", "gMine")] },
      gMine: { pkg: "com.nearme.gamecenter", act: ".Mine", title: "我的", items: [l("设置", "gSettings")] },
      gSettings: { pkg: "com.nearme.gamecenter", act: ".Settings", title: "设置", items: [l("隐私开关设置", "gPrivacy")] },
      gPrivacy: { pkg: "com.nearme.gamecenter", act: ".Privacy", title: "隐私开关设置", items: [l("个性化推荐管理", "gRec")] },
      gRec: { pkg: "com.nearme.gamecenter", act: ".Rec", title: "个性化推荐管理", items: [s("个性化推荐")] },
    },
    { "com.heytap.market": "market", "com.heytap.browser": "browser", "com.heytap.themestore": "themes", "com.heytap.yoli": "video", "com.nearme.gamecenter": "games" },
    { right: "assistant", down: "qs" },
  );
}

export function fakeVivoApps(): FakeUi {
  const S = "com.android.settings";
  return build(
    {
      settings: { pkg: S, act: ".Settings", title: "设置", items: [l("安全", "sec"), l("桌面、锁屏与壁纸", "desk"), l("系统管理与升级", "sys")] },
      sec: { pkg: S, act: ".Sec", title: "安全", items: [l("更多安全设置", "moresec")] },
      moresec: { pkg: S, act: ".MoreSec", title: "更多安全设置", items: [l("广告与隐私", "adpriv")] },
      adpriv: { pkg: S, act: ".AdPriv", title: "广告与隐私", items: [s("个性化广告"), s("个性化推荐"), s("智能推荐服务")] },
      desk: { pkg: S, act: ".Desk", title: "桌面、锁屏与壁纸", items: [l("锁屏设置", "lock")] },
      lock: { pkg: S, act: ".Lock", title: "锁屏设置", items: [l("阅图锁屏", "yuetu")] },
      yuetu: { pkg: S, act: ".Yuetu", title: "阅图锁屏", items: [s("阅图锁屏")] },
      sys: { pkg: S, act: ".Sys", title: "系统管理与升级", items: [l("全局搜索", "gs")] },
      gs: { pkg: S, act: ".Gs", title: "全局搜索", items: [l("首页展示内容", "gsHome"), l("推荐热搜榜单", "gsHot"), l("个性化内容", "gsPers"), s("历史记录")] },
      gsHome: { pkg: S, act: ".GsHome", title: "首页展示内容", items: [s("搜索框推荐词"), s("推荐卡片"), s("应用建议")] },
      gsHot: { pkg: S, act: ".GsHot", title: "推荐热搜榜单", items: [s("热门搜索")] },
      gsPers: { pkg: S, act: ".GsPers", title: "个性化内容", items: [s("广告个性化"), s("搜索结果个性化")] },

      assistant: { pkg: "com.vivo.assistant", act: ".Main", title: "负一屏", gear: "paSettings", items: [l("小V建议", "none")] },
      paSettings: { pkg: "com.vivo.assistant", act: ".Settings", title: "设置", items: [l("更多设置", "paMore")] },
      paMore: { pkg: "com.vivo.assistant", act: ".More", title: "更多设置", items: [l("个性化推荐", "paRec")] },
      paRec: { pkg: "com.vivo.assistant", act: ".Rec", title: "个性化推荐", items: [s("服务推荐"), s("资讯推荐"), s("内容精选"), s("热点资讯"), s("小V建议")] },

      market: { pkg: "com.bbk.appstore", act: ".Main", title: "应用商店", popup: true, items: [l("推荐", "none"), tab("我的", "mMine")] },
      mMine: { pkg: "com.bbk.appstore", act: ".Mine", title: "我的", gear: "mSettings", items: [l("设置", "mSettings")] },
      mSettings: { pkg: "com.bbk.appstore", act: ".Settings", title: "设置", items: [l("关于", "mAbout"), l("服务管理", "mSvc")] },
      mAbout: { pkg: "com.bbk.appstore", act: ".About", title: "关于", items: [s("个性化推荐")] },
      mSvc: { pkg: "com.bbk.appstore", act: ".Svc", title: "服务管理", items: [s("签到有礼"), s("顶部轮播图"), s("顶部栏目"), s("开屏"), s("摇一摇"), s("悬浮窗"), s("限时推广"), s("我的服务"), s("空间清理")] },

      browser: { pkg: "com.vivo.browser", act: ".Main", title: "浏览器", items: [l("今日热点", "none"), tab("我的", "bMine")] },
      bMine: { pkg: "com.vivo.browser", act: ".Mine", title: "我的", gear: "bSettings", items: [l("设置", "bSettings")] },
      bSettings: { pkg: "com.vivo.browser", act: ".Settings", title: "设置", items: [l("首页设置", "bHome"), l("隐私权限设置", "bPriv"), l("网页浏览设置", "bWeb"), l("更多设置", "bMore")] },
      bHome: { pkg: "com.vivo.browser", act: ".Home", title: "首页设置", items: [pick("极简首页"), s("首页上滑展示资讯")] },
      bPriv: { pkg: "com.vivo.browser", act: ".Priv", title: "隐私权限设置", items: [s("个性化内容"), s("第三方应用来源个性化推荐")] },
      bWeb: { pkg: "com.vivo.browser", act: ".Web", title: "网页浏览设置", items: [s("网页下载相关推荐"), s("无图模式", false)] },
      bMore: { pkg: "com.vivo.browser", act: ".More", title: "更多设置", items: [s("WiFi 连接跳转新闻资讯")] },

      secure: { pkg: "com.iqoo.secure", act: ".Main", title: "i管家", gear: "iSettings", items: [l("一键优化", "none")] },
      iSettings: { pkg: "com.iqoo.secure", act: ".Settings", title: "设置", items: [l("关于", "iAbout")] },
      iAbout: { pkg: "com.iqoo.secure", act: ".About", title: "关于", items: [l("个性化设置", "iPers")] },
      iPers: { pkg: "com.iqoo.secure", act: ".Pers", title: "个性化设置", items: [s("应用个性化推荐")] },

      weather: { pkg: "com.vivo.weather", act: ".Main", title: "天气", gear: "wSettings", items: [l("未来 15 天", "none")] },
      wSettings: { pkg: "com.vivo.weather", act: ".Settings", title: "设置", items: [l("天气服务", "wSvc")] },
      wSvc: { pkg: "com.vivo.weather", act: ".Svc", title: "天气服务", items: [s("气象预警"), s("异常天气提醒"), s("地震预警"), s("天气相关热点资讯通知")] },
    },
    { "com.bbk.appstore": "market", "com.vivo.browser": "browser", "com.iqoo.secure": "secure", "com.vivo.weather": "weather" },
    { right: "assistant" },
  );
}

export function fakeHonorApps(): FakeUi {
  const S = "com.android.settings";
  const apps = ["支付宝", "淘宝", "抖音", "美团"].map((x) => s(x));
  const sysApps = ["浏览器", "应用市场", "主题"].map((x) => s(x));
  const adList: FakePage = { pkg: S, act: ".AdPrivacy", title: "广告与隐私", items: [l("更多选项", "adMenu"), ...apps] };
  return build(
    {
      settings: { pkg: S, act: ".Settings", title: "设置", items: [l("WLAN", "none"), l("隐私和安全", "priv")] },
      priv: { pkg: S, act: ".Priv", title: "隐私和安全", items: [l("其他隐私和安全功能", "other")] },
      other: { pkg: S, act: ".Other", title: "其他隐私和安全功能", items: [l("广告与隐私", "adList")] },
      adList,
      adMenu: {
        pkg: S,
        act: ".AdMenu",
        title: "菜单",
        items: [
          { text: "显示系统程序", act: (ui) => (adList.items.push(...sysApps), ui.back()) },
          { text: "全部关闭", act: (ui) => (adList.items.forEach((i) => i.on !== undefined && (i.on = false)), ui.back()) },
        ],
      },
      oaid: { pkg: "com.hihonor.id", act: ".oaid.ui.IntelligentRecommendActivity", title: "智能推荐服务", items: [s("智能推荐服务")] },

      qs: { pkg: "com.hihonor.search", act: ".Main", title: "搜索", keyboard: true, items: [l("最近搜索", "none"), l("热门应用", "none"), l("推荐", "none"), l("更多", "qsMenu")] },
      qsMenu: { pkg: "com.hihonor.search", act: ".Menu", title: "菜单", items: [l("设置", "qsSettings")] },
      qsSettings: { pkg: "com.hihonor.search", act: ".Settings", title: "设置", items: [l("首页显示", "qsHome"), l("个性化管理", "qsPers")] },
      qsHome: { pkg: "com.hihonor.search", act: ".Home", title: "首页显示", items: [s("热搜榜"), s("热搜词推荐"), s("最近使用")] },
      qsPers: { pkg: "com.hihonor.search", act: ".Pers", title: "个性化管理", items: [s("个性化推荐"), s("个性化广告")] },

      assistant: { pkg: "com.hihonor.intelligent", act: ".Main", title: "负一屏", items: [l("头像", "paMenu")] },
      paMenu: { pkg: "com.hihonor.intelligent", act: ".Me", title: "我的", items: [l("设置", "paSettings")] },
      paSettings: { pkg: "com.hihonor.intelligent", act: ".Settings", title: "设置", items: [s("智能推荐"), s("个性化广告"), s("个性化消息"), l("资讯服务", "paNews")] },
      paNews: { pkg: "com.hihonor.intelligent", act: ".News", title: "资讯服务", items: [s("资讯精选")] },

      topApps: { pkg: "com.hihonor.appmarket", act: ".module.topapps.TopAppsSettingActivity", title: "更多推荐", items: [s("推荐应用"), s("推荐游戏")] },
      popular: { pkg: "com.hihonor.appmarket", act: ".popularapps.activity.PopularAppsSettingActivity", title: "热门推荐管理", items: [s("热门推荐")] },
      market: { pkg: "com.hihonor.appmarket", act: ".MainActivity", title: "应用市场", popup: true, items: [l("推荐", "none"), tab("首页"), tab("我的", "mMine")] },
      mMine: { pkg: "com.hihonor.appmarket", act: ".Mine", title: "我的", items: [l("设置", "mSettings")] },
      mSettings: { pkg: "com.hihonor.appmarket", act: ".Settings", title: "设置", items: [l("内容推荐服务", "mRec"), l("消息通知管理", "mMsg"), l("消息中心提醒", "mCenter"), l("服务模式", "none")] },
      mRec: { pkg: "com.hihonor.appmarket", act: ".Rec", title: "内容推荐服务", items: [s("营销服务推荐"), s("个性化服务推荐")] },
      mMsg: { pkg: "com.hihonor.appmarket", act: ".Msg", title: "消息通知管理", items: [s("消息通知"), s("应用更新")] },
      mCenter: { pkg: "com.hihonor.appmarket", act: ".Center", title: "消息中心提醒", items: [s("活动福利"), s("游戏动态"), s("安装提醒")] },

      browser: { pkg: "com.honor.browser", act: ".Main", title: "浏览器", items: [l("今日热点", "none"), tab("首页"), tab("我的", "bMine")] },
      bMine: { pkg: "com.honor.browser", act: ".Mine", title: "我的", icons: [{ rid: "top_local_icon", to: "none" }, { rid: "top_local_icon", to: "none" }, { rid: "top_local_icon", to: "bSettings" }], items: [l("书签", "none")] },
      bSettings: { pkg: "com.honor.browser", act: ".Settings", title: "设置", items: [l("模式选择", "bMode"), l("消息通知", "bMsg"), l("隐私管理", "bPriv")] },
      bMode: { pkg: "com.honor.browser", act: ".Mode", title: "模式选择", items: [pick("经典首页"), pick("简洁首页")] },
      bMsg: { pkg: "com.honor.browser", act: ".Msg", title: "消息通知", items: [s("新闻热点"), s("兴趣推送"), s("下载完成提醒")] },
      bPriv: { pkg: "com.honor.browser", act: ".Priv", title: "隐私管理", items: [l("个性化推荐", "bRec"), l("互动广告管理", "bAds")] },
      bRec: { pkg: "com.honor.browser", act: ".Rec", title: "个性化推荐", items: [s("个性化内容")] },
      bAds: { pkg: "com.honor.browser", act: ".Ads", title: "互动广告管理", items: [s("摇一摇"), s("扭一扭")] },

      themes: { pkg: "com.hihonor.android.thememanager", act: ".Main", title: "主题", items: [l("推荐", "none"), tab("我的", "tMine")] },
      tMine: { pkg: "com.hihonor.android.thememanager", act: ".Mine", title: "我的", items: [l("设置", "tSettings")] },
      tSettings: { pkg: "com.hihonor.android.thememanager", act: ".Settings", title: "设置", items: [l("通知", "tMsg"), l("个性化服务", "tPers")] },
      tMsg: { pkg: "com.hihonor.android.thememanager", act: ".Msg", title: "通知", items: [s("消息"), s("短信"), s("邮件")] },
      tPers: { pkg: "com.hihonor.android.thememanager", act: ".Pers", title: "个性化服务", items: [s("个性化推荐")] },

      video: { pkg: "com.hihonor.youku.video", act: "com.youku.android.youkusetting.activity.SettingsActivity", title: "设置", items: [l("其他设置", "vOther")] },
      vOther: { pkg: "com.hihonor.youku.video", act: ".Other", title: "其他设置", items: [s("个性化内容"), s("个性化广告"), s("OAID"), s("自动播放")] },
      manager: { pkg: "com.hihonor.systemmanager", act: ".mainscreen.SettingActivity", title: "设置", items: [s("应用推荐"), s("骚扰拦截")] },
    },
    { "com.hihonor.appmarket": "market", "com.honor.browser": "browser", "com.hihonor.android.thememanager": "themes" },
    { right: "assistant", down: "qs" },
  );
}

// 华为和三星没有实测清单，下面的界面是按公开教程猜的，只用来测代码路径。
export function fakeHuaweiApps(): FakeUi {
  const S = "com.android.settings";
  return build(
    {
      settings: { pkg: S, act: ".HWSettings", title: "设置", items: [l("WLAN", "none"), l("智慧助手", "assist"), l("隐私", "priv")] },
      priv: { pkg: S, act: ".Priv", title: "隐私", items: [l("权限管理", "none"), l("广告与隐私", "adpriv")] },
      adpriv: { pkg: S, act: ".AdPriv", title: "广告与隐私", items: [s("限制广告追踪", false), l("更多信息", "adMore")] },
      adMore: { pkg: S, act: ".AdMore", title: "更多信息", items: [s("智能推荐服务")] },
      assist: { pkg: S, act: ".Assist", title: "智慧助手", items: [l("智慧搜索", "search"), l("今天", "today")] },
      search: { pkg: S, act: ".Search", title: "智慧搜索", items: [s("实时热点"), s("搜索历史"), l("高级设置", "searchAdv")] },
      searchAdv: { pkg: S, act: ".SearchAdv", title: "高级设置", items: [s("个性化推荐"), s("个性化广告")] },
      today: { pkg: S, act: ".Today", title: "今天", items: [l("设置", "todaySettings")] },
      todaySettings: { pkg: S, act: ".TodaySettings", title: "今天设置", items: [s("个性化广告"), s("华为广告"), s("三方广告"), s("航班提醒")] },

      browser: { pkg: "com.huawei.browser", act: ".Main", title: "浏览器", items: [l("今日热点", "none"), tab("首页"), tab("我的", "bMine")] },
      bMine: { pkg: "com.huawei.browser", act: ".Mine", title: "我的", items: [l("设置", "bSettings")] },
      bSettings: { pkg: "com.huawei.browser", act: ".Settings", title: "浏览器设置", items: [l("消息通知", "bMsg"), l("安全与隐私", "bPriv"), l("个性化广告", "bAds")] },
      bMsg: { pkg: "com.huawei.browser", act: ".Msg", title: "消息通知", items: [s("资讯通知"), s("下载完成通知")] },
      bPriv: { pkg: "com.huawei.browser", act: ".Priv", title: "安全与隐私", items: [s("个性化内容"), s("保存密码")] },
      bAds: { pkg: "com.huawei.browser", act: ".Ads", title: "个性化广告", items: [s("个性化广告"), s("摇一摇广告"), s("开屏广告")] },
    },
    { "com.huawei.browser": "browser" },
    {},
  );
}

export function fakeSamsungApps(): FakeUi {
  const S = "com.android.settings";
  return build(
    {
      settings: { pkg: S, act: ".SecSettings", title: "设置", items: [l("三星账户", "acct"), l("连接", "none"), l("隐私", "priv")] },
      priv: { pkg: S, act: ".Priv", title: "隐私", items: [l("权限管理器", "none"), l("定制服务", "custom")] },
      custom: { pkg: S, act: ".Custom", title: "定制服务", items: [s("定制广告和直接营销"), s("使用情况分析")] },
      acct: { pkg: S, act: ".Acct", title: "三星账户", items: [l("安全与隐私", "acctPriv")] },
      acctPriv: { pkg: S, act: ".AcctPriv", title: "安全与隐私", items: [s("获取新闻和特别优惠"), s("使用三星账户数据改进个性化广告"), s("两步验证")] },

      store: { pkg: "com.sec.android.app.samsungapps", act: ".Main", title: "Galaxy Store", popup: true, items: [l("推荐", "none"), tab("菜单", "storeMenu")] },
      storeMenu: { pkg: "com.sec.android.app.samsungapps", act: ".Menu", title: "菜单", gear: "storeSettings", items: [l("我的应用", "none")] },
      storeSettings: { pkg: "com.sec.android.app.samsungapps", act: ".Settings", title: "Galaxy Store 设置", items: [s("自动更新应用"), l("定制服务", "storeCustom")] },
      storeCustom: { pkg: "com.sec.android.app.samsungapps", act: ".Custom", title: "定制服务", items: [s("定制服务")] },
    },
    { "com.sec.android.app.samsungapps": "store" },
    {},
  );
}

const BRANDS = {
  oppo: { props: ["OPPO", "OPPO", "PJA110（演示）"], apps: fakeOppoApps, extra: ["com.opos.ads", "com.heytap.pictorial", "com.nearme.instant.platform"] },
  vivo: { props: ["vivo", "vivo", "V2547A（演示）"], apps: fakeVivoApps, extra: ["com.vivo.hybrid"] },
  honor: { props: ["HONOR", "HONOR", "PNM-AN10（演示）"], apps: fakeHonorApps, extra: ["com.hihonor.quickengine"] },
  huawei: { props: ["HUAWEI", "HUAWEI", "NOH-AN00（演示）"], apps: fakeHuaweiApps, extra: ["com.huawei.fastapp"] },
  samsung: { props: ["samsung", "samsung", "SM-S9180（演示）"], apps: fakeSamsungApps, extra: [] },
} as const;

/** 某个品牌的模拟手机：装着这个品牌的应用，界面按清单搭好。 */
export function brandPhone(brand: keyof typeof BRANDS): { state: FakeState; ui: FakeUi } {
  const b = BRANDS[brand];
  const ui = b.apps();
  const state = demoState();
  state.props["ro.product.brand"] = b.props[0];
  state.props["ro.product.manufacturer"] = b.props[1];
  state.props["ro.product.model"] = b.props[2];
  state.packages = [...new Set([...Object.values(ui.pages).map((p) => p.pkg), ...b.extra, "com.tencent.mm", "com.taobao.taobao"])];
  if (brand === "vivo") state.settings["secure/switch_quick_app_service"] = "1";
  return { state, ui };
}
