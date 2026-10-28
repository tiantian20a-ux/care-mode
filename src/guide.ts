// 各品牌打开 USB 调试的步骤。菜单名随系统版本会略有不同，找不到时在设置里搜「版本号」「开发者选项」。

export interface BrandGuide {
  id: string;
  name: string;
  /** 连点 7 次的那一项在哪。 */
  version: string;
  /** 开发者选项在哪。 */
  developer: string;
  /** 开发者选项里要打开的开关。 */
  toggles: string[];
  note?: string;
}

export const GUIDES: BrandGuide[] = [
  {
    id: "xiaomi",
    name: "小米 / 红米 / POCO",
    version: "设置 → 我的设备 → 全部参数与信息 → 连点「OS 版本」（旧版叫「MIUI 版本」）",
    developer: "设置 → 更多设置 → 开发者选项",
    toggles: ["USB 调试", "USB 调试（安全设置）"],
    note: "「USB 调试（安全设置）」要插 SIM 卡、登录小米账号才能打开，不开的话电脑点不动屏幕，品牌专属的项目会跳过。",
  },
  {
    id: "oppo",
    name: "OPPO / 一加 / realme",
    version: "设置 → 关于本机 → 版本信息 → 连点「版本号」",
    developer: "设置 → 系统与更新（旧版叫「其他设置」）→ 开发者选项",
    toggles: ["USB 调试"],
    note: "有的版本还有「禁止权限监控」，不用动。",
  },
  {
    id: "vivo",
    name: "vivo / iQOO",
    version: "设置 → 系统管理（或「更多设置」）→ 关于手机 → 版本信息 → 连点「软件版本号」",
    developer: "设置 → 系统管理（或「更多设置」）→ 开发者选项",
    toggles: ["USB 调试"],
  },
  {
    id: "honor",
    name: "荣耀",
    version: "设置 → 关于手机 → 连点「版本号」",
    developer: "设置 → 系统和更新 → 开发人员选项",
    toggles: ["USB 调试", "「仅充电」模式下允许 ADB 调试"],
    note: "如果没有第二个开关，连线后手机上的 USB 用途要选「传输文件」。",
  },
  {
    id: "huawei",
    name: "华为",
    version: "设置 → 关于手机 → 连点「版本号」",
    developer: "设置 → 系统和更新 → 开发人员选项",
    toggles: ["USB 调试", "「仅充电」模式下允许 ADB 调试"],
    note: "只支持 EMUI 和 HarmonyOS 4 及以下。HarmonyOS NEXT（5.0 起）不是安卓，连不上。",
  },
  {
    id: "samsung",
    name: "三星",
    version: "设置 → 关于手机 → 软件信息 → 连点「编译编号」",
    developer: "设置 → 开发者选项（在设置列表最下面）",
    toggles: ["USB 调试"],
  },
  {
    id: "other",
    name: "其他品牌",
    version: "设置 → 关于手机 → 连点「版本号」（可能在「软件信息」「版本信息」里）",
    developer: "设置 → 系统（或「更多设置」）→ 开发者选项",
    toggles: ["USB 调试"],
  },
];
