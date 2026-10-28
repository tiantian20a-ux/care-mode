// 规则包和备份文件的类型。语义与 tools/plan.py 保持一致。

export type Tier = "recommended" | "optional" | "consent";

export interface Param {
  default: string;
  choices: string[];
  choicesMinSdk34?: string[];
  labels?: Record<string, string>;
}

export type Action =
  | { type: "setting"; ns: "system" | "secure" | "global"; key: string; value: string; noRestore?: boolean; onlyIfExists?: boolean }
  | { type: "wm_density"; factor: string }
  | { type: "appop_revoke_all"; op: string; from: string; to: string }
  | { type: "suspend"; onlyIfInstalled?: boolean; packages: { pkg: string; brand: string; verified: boolean }[] }
  | { type: "ui_recipe"; recipe: string; segment: string }
  | { type: "package_network_off"; pkg: string }
  | {
      type: "notification_channels";
      listCmd: string;
      matchName: string[];
      neverMatch: string[];
      skipPackages: string[];
    };

export interface DnsCheck {
  check: "dns_resolves";
  host: string;
}

export interface Rule {
  id: string;
  /** 界面上的分组标题，品牌规则包会设成品牌名。 */
  group?: string;
  title: string;
  why: string;
  tier: Tier;
  caution?: string;
  minSdk?: number;
  requires?: string[];
  runLast?: boolean;
  executor?: "ui";
  params?: Record<string, Param>;
  actions: Action[];
  verify?: DnsCheck & { waitSeconds: number; retries: number; onFail: "rollback"; message: string };
}

export interface Pack {
  pack: string;
  /** 品牌规则包：getprop 的 brand 或 manufacturer 命中任一（不分大小写）就用。 */
  match?: { brand?: string[]; manufacturer?: string[] };
  credits?: string;
  title: string;
  version: string;
  appliesTo: { os: string; minSdk: number };
  preflight?: {
    props: Record<string, string>;
    checks: (
      | { id: string; cmd: string; expect: string; onFail: "abort" | "warn"; message: string }
      | (DnsCheck & { id: string; onFail: "abort" | "warn"; message: string })
    )[];
  };
  rules: Rule[];
}

export interface DeviceInfo {
  brand: string;
  manufacturer: string;
  model: string;
  sdk: number;
  release: string;
}

// 还原操作只存结构化数据，不存原始命令，避免别人改过的备份文件在手机上执行任意命令。
export type RestoreOp =
  | { op: "setting"; ns: "system" | "secure" | "global"; key: string; value: string | null }
  | { op: "density"; value: number | null }
  | { op: "appop"; pkg: string; name: string; mode: string }
  | { op: "unsuspend"; pkg: string }
  | { op: "channel_on"; pkg: string; channel: string; name: string }
  | { op: "package_network"; pkg: string; enabled: true }
  /** 应用内的开关没法安全地自动拨回，只给出手动还原的提示。 */
  | { op: "manual"; text: string };

export interface Backup {
  format: "care-mode-backup";
  version: 1;
  createdAt: string;
  pack: { name: string; version: string };
  device: DeviceInfo;
  rules: { id: string; title: string; restore: RestoreOp[] }[];
}

export interface Shell {
  run(cmd: string, opts?: { timeoutMs?: number }): Promise<{ out: string; code: number }>;
  sleep(ms: number): Promise<void>;
}
