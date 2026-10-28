// 模拟手机的界面：几个按小米清单搭出来的设置页，能点、能翻页、能返回、会弹更新框。
// 只用于自动测试和演示模式。

export interface FakeItem {
  text: string;
  /** 有这个字段就是一个开关。 */
  on?: boolean;
  /** 点了跳到哪一页。 */
  to?: string;
  /** 放在底部标签栏。 */
  tab?: boolean;
  /** 单选项（比如「简洁」「不显示」），点了记到 FakeUi.picked。 */
  pick?: boolean;
  /** 点了以后执行，比如菜单里的「全部关闭」。 */
  act?: (ui: FakeUi) => void;
}

export interface FakePage {
  pkg: string;
  act: string;
  title: string;
  items: FakeItem[];
  /** 右上角没有文字的齿轮，点了跳到哪一页。 */
  gear?: string;
  /** 打开时先弹一个更新框。 */
  popup?: boolean;
  /** 打开时弹出键盘，第一次按返回只收键盘。 */
  keyboard?: boolean;
  /** 右上角一排没有文字的图标，按 resource-id 区分。 */
  icons?: { rid: string; to: string }[];
}

const W = 1080;
const H = 2400;
const ROW = 200;
const LIST_TOP = 300;
const LIST_BOTTOM = 2200;
const PER_SCREEN = Math.floor((LIST_BOTTOM - LIST_TOP) / ROW);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export class FakeUi {
  stack: { id: string; offset: number }[] = [];
  popupShown = new Set<string>();
  popupOpen = false;
  keyboardOpen = false;
  picked: string[] = [];
  /** 在桌面上的手势打开哪一页：right=从左向右滑（负一屏），down=下拉（搜索）。 */
  gestures: { right?: string; down?: string } = {};

  constructor(public pages: Record<string, FakePage>, public launchers: Record<string, string>) {}

  get top() {
    return this.stack[this.stack.length - 1];
  }

  page(): FakePage | undefined {
    return this.top && this.pages[this.top.id];
  }

  focus(): string {
    const p = this.page();
    return p ? `${p.pkg}/${p.act}` : "com.miui.home/.launcher.Launcher";
  }

  open(id: string) {
    this.stack.push({ id, offset: 0 });
    const p = this.pages[id];
    this.keyboardOpen = !!p.keyboard;
    if (p.popup && !this.popupShown.has(id)) {
      this.popupShown.add(id);
      this.popupOpen = true;
    }
  }

  launch(pkg: string, act?: string): boolean {
    const id = act ? Object.keys(this.pages).find((k) => this.pages[k].pkg === pkg && this.pages[k].act === act) : this.launchers[pkg];
    if (!id) return false;
    this.stack = this.stack.filter((s) => this.pages[s.id].pkg !== pkg);
    this.open(id);
    return true;
  }

  gesture(kind: "right" | "down") {
    if (this.stack.length) return false;
    const id = this.gestures[kind];
    if (id) this.open(id);
    return !!id;
  }

  back() {
    if (this.popupOpen) this.popupOpen = false;
    else if (this.keyboardOpen) this.keyboardOpen = false;
    else this.stack.pop();
  }

  home() {
    this.stack = [];
    this.popupOpen = false;
  }

  private list(p: FakePage) {
    return p.items.filter((i) => !i.tab);
  }

  scroll(dy: number) {
    const p = this.page();
    if (!p || this.popupOpen) return;
    const max = Math.max(0, this.list(p).length - PER_SCREEN);
    const rows = Math.round(dy / ROW);
    this.top.offset = Math.min(max, Math.max(0, this.top.offset + rows));
  }

  tap(x: number, y: number) {
    const p = this.page();
    if (!p) return;
    if (this.popupOpen) {
      if (y >= 1300 && y <= 1450) this.popupOpen = false; // 「以后再说」
      return;
    }
    if (p.gear && x >= 960 && y >= 100 && y <= 200) return this.open(p.gear);
    if (p.icons && y >= 100 && y <= 200) {
      const i = Math.floor((x - 560) / 120);
      if (p.icons[i]) return this.open(p.icons[i].to);
    }
    const tabs = p.items.filter((i) => i.tab);
    if (y >= 2250 && tabs.length) {
      const t = tabs[Math.min(tabs.length - 1, Math.floor(x / (W / tabs.length)))];
      if (t.to) this.open(t.to);
      return;
    }
    if (y < LIST_TOP || y >= LIST_BOTTOM) return;
    const item = this.list(p)[this.top.offset + Math.floor((y - LIST_TOP) / ROW)];
    if (!item) return;
    if (item.act) item.act(this);
    else if (item.pick) this.picked.push(`${this.top.id}·${item.text}`);
    else if (item.on !== undefined && x >= 880) item.on = !item.on;
    else if (item.to) this.open(item.to);
    else if (item.on !== undefined) item.on = !item.on;
  }

  dump(): string {
    const p = this.page();
    const node = (attrs: Record<string, string | boolean>, inner = "") => {
      const a = { text: "", "content-desc": "", "resource-id": "", class: "android.view.View", package: p?.pkg ?? "com.miui.home", checkable: false, checked: false, clickable: false, scrollable: false, ...attrs };
      const s = Object.entries(a).map(([k, v]) => `${k}="${esc(String(v))}"`).join(" ");
      return inner ? `<node ${s}>${inner}</node>` : `<node ${s} />`;
    };
    let body: string;
    if (!p) {
      body = node({ class: "android.widget.FrameLayout", bounds: `[0,0][${W},${H}]` }, node({ text: "桌面", bounds: "[0,1000][1080,1100]" }));
    } else if (this.popupOpen) {
      body = node(
        { class: "android.widget.FrameLayout", bounds: `[0,0][${W},${H}]` },
        node({ text: "发现新版本", bounds: "[100,1000][980,1150]" }) + node({ text: "以后再说", class: "android.widget.Button", clickable: true, bounds: "[100,1300][980,1450]" }),
      );
    } else {
      const rows = this.list(p)
        .slice(this.top.offset, this.top.offset + PER_SCREEN)
        .map((it, i) => {
          const y = LIST_TOP + i * ROW;
          const label = node({ text: it.text, class: "android.widget.TextView", bounds: `[40,${y + 40}][860,${y + 110}]` });
          const sw =
            it.on === undefined
              ? ""
              : node({ class: "android.widget.Switch", checkable: true, checked: it.on, clickable: true, bounds: `[900,${y + 50}][1040,${y + 150}]` });
          return node({ class: "android.widget.LinearLayout", clickable: !!it.to, bounds: `[0,${y}][${W},${y + ROW}]` }, label + sw);
        })
        .join("");
      const tabs = p.items.filter((i) => i.tab);
      const tabNodes = tabs
        .map((t, i) => node({ text: t.text, class: "android.widget.TextView", clickable: true, bounds: `[${Math.floor((i * W) / tabs.length)},2250][${Math.floor(((i + 1) * W) / tabs.length)},2400]` }))
        .join("");
      const scrollable = this.list(p).length > PER_SCREEN;
      body = node(
        { class: "android.widget.FrameLayout", bounds: `[0,0][${W},${H}]` },
        node({ text: p.title, class: "android.widget.TextView", bounds: "[40,100][700,200]" }) +
          (p.gear ? node({ "content-desc": "设置", class: "android.widget.ImageView", clickable: true, bounds: "[960,100][1060,200]" }) : "") +
          (p.icons ?? []).map((ic, i) => node({ "resource-id": `${p.pkg}:id/${ic.rid}`, class: "android.widget.ImageView", clickable: true, bounds: `[${560 + i * 120},100][${660 + i * 120},200]` })).join("") +
          node({ class: "androidx.recyclerview.widget.RecyclerView", scrollable, bounds: `[0,${LIST_TOP}][${W},${LIST_BOTTOM}]` }, rows || node({ bounds: `[0,${LIST_TOP}][1,${LIST_TOP + 1}]` })) +
          tabNodes,
      );
    }
    return `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">${body}</hierarchy>`;
  }

  /** 加一组页面（另一个品牌的应用）。 */
  add(pages: Record<string, FakePage>, launchers: Record<string, string>) {
    Object.assign(this.pages, pages);
    Object.assign(this.launchers, launchers);
  }
}

/** 按 android-ad-cleaner 的小米清单搭的模拟应用。 */
export function fakeXiaomiApps(): FakeUi {
  const s = (text: string, on = true): FakeItem => ({ text, on });
  const l = (text: string, to: string): FakeItem => ({ text, to });
  const pages: Record<string, FakePage> = {
    settings: { pkg: "com.android.settings", act: ".MainSettings", title: "设置", items: [l("WLAN", "none"), l("蓝牙", "none"), l("隐私与安全", "privacy")] },
    none: { pkg: "com.android.settings", act: ".SubSettings", title: "空", items: [] },
    privacy: { pkg: "com.android.settings", act: ".SubSettings", title: "隐私与安全", items: [l("权限管理", "none"), l("更多安全设置", "moresec")] },
    moresec: { pkg: "com.android.settings", act: ".SubSettings", title: "更多安全设置", items: [l("广告服务", "adsvc")] },
    adsvc: { pkg: "com.android.settings", act: ".SubSettings", title: "广告服务", items: [s("个性化广告推荐"), s("限制广告跟踪", false)] },

    market: { pkg: "com.xiaomi.market", act: ".ui.MarketTabActivity", title: "应用商店", popup: true, items: [l("首页推荐", "none"), { text: "首页", tab: true }, { text: "我的", tab: true, to: "marketMine" }] },
    marketMine: { pkg: "com.xiaomi.market", act: ".ui.MineActivity", title: "我的", gear: "marketSettings", items: [l("设置", "marketSettings"), l("我的应用", "none")] },
    marketSettings: { pkg: "com.xiaomi.market", act: ".ui.SettingsActivity", title: "设置", items: [l("隐私设置", "marketPrivacy"), l("通知设置", "marketNotify")] },
    marketPrivacy: { pkg: "com.xiaomi.market", act: ".ui.PrivacyActivity", title: "隐私设置", items: [s("个性化服务")] },
    marketNotify: { pkg: "com.xiaomi.market", act: ".ui.NotifyActivity", title: "通知设置", items: [s("推送消息"), s("应用更新"), s("新手帮助")] },

    security: { pkg: "com.miui.securitycenter", act: "com.miui.securityscan.ui.settings.SettingsActivity", title: "设置", items: [l("隐私设置", "secPrivacy"), l("垃圾清理", "secClean")] },
    secPrivacy: { pkg: "com.miui.securitycenter", act: ".Privacy", title: "隐私设置", items: [s("个性化推荐")] },
    secClean: { pkg: "com.miui.securitycenter", act: ".Clean", title: "垃圾清理", items: [s("推荐内容"), s("自动清理", false)] },

    downloads: { pkg: "com.android.providers.downloads.ui", act: ".DownloadList", title: "下载管理", gear: "dlSettings", items: [l("某个文件.apk", "none")] },
    dlSettings: { pkg: "com.android.providers.downloads.ui", act: ".Settings", title: "设置", items: [l("信息流设置", "dlFeed")] },
    dlFeed: { pkg: "com.android.providers.downloads.ui", act: ".Feed", title: "信息流设置", items: [s("资源推荐"), s("热榜推荐")] },

    themes: { pkg: "com.android.thememanager", act: ".ThemeResourceTabActivity", title: "主题", items: [l("推荐主题", "none"), { text: "我的", tab: true, to: "themeMine" }] },
    themeMine: { pkg: "com.android.thememanager", act: ".Mine", title: "我的", gear: "themeSettings", items: [l("已购买", "none"), l("设置", "themeSettings")] },
    themeSettings: { pkg: "com.android.thememanager", act: ".Settings", title: "设置", items: [s("每次联网时通知"), s("自动更新"), l("隐私设置", "themePrivacy")] },
    themePrivacy: { pkg: "com.android.thememanager", act: ".Privacy", title: "隐私设置", items: [s("个性化推荐")] },

    browser: { pkg: "com.android.browser", act: ".BrowserActivity", title: "浏览器", items: [l("今日新闻：我的家乡", "none"), { text: "首页", tab: true }, { text: "我的", tab: true, to: "browserMine" }] },
    browserMine: { pkg: "com.android.browser", act: ".Mine", title: "我的", gear: "browserSettings", items: [l("书签", "none")] },
    browserSettings: {
      pkg: "com.android.browser",
      act: ".Settings",
      title: "设置",
      items: [l("隐私和安全", "brPrivacy"), l("主页设置", "brHome"), l("搜索设置", "brSearch"), l("功能设置", "brFunc"), ...Array.from({ length: 8 }, (_, i) => l(`其他设置 ${i + 1}`, "none"))],
    },
    brPrivacy: { pkg: "com.android.browser", act: ".Privacy", title: "隐私和安全", items: [s("个性化内容推荐"), s("个性化广告推荐"), s("保存密码")] },
    brHome: { pkg: "com.android.browser", act: ".Home", title: "主页设置", items: [s("宫格位推送")] },
    brSearch: { pkg: "com.android.browser", act: ".Search", title: "搜索设置", items: [s("显示猜你想搜模块")] },
    brFunc: { pkg: "com.android.browser", act: ".Func", title: "功能设置", items: [s("小说"), s("我的网盘")] },

    search: { pkg: "com.android.quicksearchbox", act: ".preferences.SearchSettingsPreferenceActivity", title: "搜索设置", items: [l("首页展示模块", "qsHome")] },
    qsHome: { pkg: "com.android.quicksearchbox", act: ".Home", title: "首页展示模块", items: [s("搜索提示词"), l("应用推荐", "qsApps"), l("热搜榜单", "qsHot")] },
    qsApps: { pkg: "com.android.quicksearchbox", act: ".Apps", title: "应用推荐", items: [s("展示常用应用"), s("推荐未安装应用")] },
    qsHot: { pkg: "com.android.quicksearchbox", act: ".Hot", title: "热搜榜单", items: [s("推荐"), s("微博"), s("资讯"), s("全网"), s("影视"), s("音乐"), s("小说"), s("知乎"), s("精选"), s("体育")] },

    assistant: { pkg: "com.miui.personalassistant", act: ".settings.PASettingActivity", title: "负一屏设置", items: [s("推荐卡片"), s("热门活动"), s("搜索框"), s("出行助手"), l("隐私设置", "paPrivacy")] },
    paPrivacy: { pkg: "com.miui.personalassistant", act: ".Privacy", title: "隐私设置", items: [s("个性化推荐")] },

    weather: { pkg: "com.miui.weather2", act: ".ActivityWeatherMain", title: "北京", gear: "wSettings", items: [l("未来 15 天", "none")] },
    wSettings: { pkg: "com.miui.weather2", act: ".Settings", title: "设置", items: [s("天气预警"), s("异常天气提醒"), l("用户体验计划", "wUx")] },
    wUx: { pkg: "com.miui.weather2", act: ".Ux", title: "用户体验计划", items: [s("内容推广"), s("天气视频卡片")] },
    calendar: { pkg: "com.android.calendar", act: ".homepage.AllInOneActivity", title: "日历", gear: "cSettings", items: [l("今天", "none")] },
    cSettings: { pkg: "com.android.calendar", act: ".Settings", title: "设置", items: [s("节假日提醒"), l("用户体验计划", "cUx")] },
    cUx: { pkg: "com.android.calendar", act: ".Ux", title: "用户体验计划", items: [s("内容推广")] },
  };
  return new FakeUi(pages, {
    "com.xiaomi.market": "market",
    "com.android.providers.downloads.ui": "downloads",
    "com.android.thememanager": "themes",
    "com.android.browser": "browser",
    "com.miui.weather2": "weather",
    "com.android.calendar": "calendar",
    "com.android.settings": "settings",
  });
}

/** 所有开关当前状态，测试用：{ "页面标题 · 开关": 开/关 } */
export function switchStates(ui: FakeUi): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, p] of Object.entries(ui.pages)) for (const it of p.items) if (it.on !== undefined) out[`${id}·${it.text}`] = it.on;
  return out;
}
