// 规则引擎：检查 → 备份 → 执行 → 校验 → 还原。
// 每种 action 的语义与 tools/plan.py 一致；这里多了真实读取手机状态、校验和回滚。

import type { Action, Backup, DeviceInfo, Pack, RestoreOp, Rule, Shell } from "./types";
import { listChannels, setChannelEnabled, type Channel } from "./channels";
import { shQuote } from "./util";

export { shQuote };

export type Log = (level: "info" | "ok" | "warn" | "error", text: string) => void;

const PKG_RE = /^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$/;
const KEY_RE = /^[\w.]+$/;
const OP_RE = /^[A-Z_]+$/;
const MODES = new Set(["allow", "deny", "ignore", "default", "foreground", "errored"]);
const NS = new Set(["system", "secure", "global"]);

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in values)) throw new Error(`缺少参数 ${k}`);
    return values[k];
  });
}

// ---------- 检查 ----------

export async function readDevice(sh: Shell, pack: Pack): Promise<DeviceInfo> {
  const get = async (k: string) => (await sh.run(`getprop ${pack.preflight.props[k]}`)).out.trim();
  return {
    brand: await get("brand"),
    manufacturer: await get("manufacturer"),
    model: await get("model"),
    sdk: Number(await get("sdk")),
    release: await get("release"),
  };
}

/** 只看域名能不能解析出来，不要求 ping 通（有些网络会挡 ICMP）。 */
export async function dnsResolves(sh: Shell, host: string): Promise<boolean> {
  const { out } = await sh.run(`ping -c 1 -W 5 ${shQuote(host)} 2>&1`, { timeoutMs: 10000 });
  if (/unknown host|bad address|Name or service not known/i.test(out)) return false;
  return /^PING /m.test(out);
}

export interface PreflightResult {
  device: DeviceInfo;
  online: boolean;
  problems: { level: "abort" | "warn"; message: string }[];
}

export async function preflight(sh: Shell, pack: Pack): Promise<PreflightResult> {
  const device = await readDevice(sh, pack);
  const problems: PreflightResult["problems"] = [];
  let online = true;
  if (!(device.sdk >= pack.appliesTo.minSdk)) {
    problems.push({ level: "abort", message: `这台手机的安卓版本太旧（需要安卓 8 以上）。` });
  }
  for (const c of pack.preflight.checks) {
    let ok: boolean;
    if ("check" in c) ok = await dnsResolves(sh, c.host);
    else ok = (await sh.run(c.cmd)).out.trim() === c.expect;
    if (c.id === "network") online = ok;
    if (!ok) problems.push({ level: c.onFail, message: c.message });
  }
  return { device, online, problems };
}

// ---------- 参数和跳过条件 ----------

export function paramChoices(rule: Rule, name: string, sdk: number): string[] {
  const p = rule.params![name];
  return sdk >= 34 && p.choicesMinSdk34 ? p.choicesMinSdk34 : p.choices;
}

export function defaultParams(rule: Rule): Record<string, string> {
  return Object.fromEntries(Object.entries(rule.params ?? {}).map(([k, p]) => [k, p.default]));
}

export function skipReason(rule: Rule, ctx: { sdk: number; online: boolean }): string | null {
  if (rule.minSdk && ctx.sdk < rule.minSdk) return "这台手机的安卓版本不支持";
  if (rule.requires?.includes("preflight.network") && !ctx.online) return "手机现在没联网";
  return null;
}

export function orderedRules(pack: Pack): Rule[] {
  return [...pack.rules.filter((r) => !r.runLast), ...pack.rules.filter((r) => r.runLast)];
}

// ---------- 备份（同时算出要执行的步骤） ----------

type Step =
  | { kind: "cmd"; cmd: string; tolerateDisconnect?: boolean }
  | { kind: "channel_off"; ch: Channel };

export interface PlannedRule {
  rule: Rule;
  values: Record<string, string>;
  steps: Step[];
  restore: RestoreOp[];
}

export interface Selection {
  id: string;
  params: Record<string, string>;
}

function parseSetting(out: string): string | null {
  const v = out.trim();
  return v === "null" || v === "" ? null : v;
}

async function planAction(sh: Shell, a: Action, values: Record<string, string>): Promise<{ steps: Step[]; restore: RestoreOp[] }> {
  switch (a.type) {
    case "setting": {
      const value = fill(a.value, values);
      const prev = parseSetting((await sh.run(`settings get ${a.ns} ${a.key}`)).out);
      return {
        steps: [{ kind: "cmd", cmd: `settings put ${a.ns} ${a.key} ${shQuote(value)}`, tolerateDisconnect: a.noRestore }],
        restore: a.noRestore ? [] : [{ op: "setting", ns: a.ns, key: a.key, value: prev }],
      };
    }
    case "wm_density": {
      const { out } = await sh.run("wm density");
      const phys = Number(/Physical density:\s*(\d+)/.exec(out)?.[1]);
      const ov = /Override density:\s*(\d+)/.exec(out)?.[1];
      if (!phys) throw new Error("读不到屏幕密度");
      const target = Math.round(phys * Number(fill(a.factor, values)));
      return { steps: [{ kind: "cmd", cmd: `wm density ${target}` }], restore: [{ op: "density", value: ov ? Number(ov) : null }] };
    }
    case "appop_revoke_all": {
      const { out } = await sh.run(`cmd appops query-op --user 0 ${a.op} ${a.from}`);
      const pkgs = out.split("\n").map((l) => l.trim()).filter((l) => PKG_RE.test(l));
      return {
        steps: pkgs.map((p) => ({ kind: "cmd", cmd: `cmd appops set --user 0 ${p} ${a.op} ${a.to}` })),
        restore: pkgs.map((p) => ({ op: "appop", pkg: p, name: a.op, mode: a.from })),
      };
    }
    case "suspend": {
      const todo: string[] = [];
      for (const { pkg } of a.packages) {
        const listed = (await sh.run(`pm list packages ${pkg}`)).out.split("\n").map((l) => l.trim());
        if (a.onlyIfInstalled && !listed.includes(`package:${pkg}`)) continue;
        const dump = (await sh.run(`dumpsys package ${pkg}`)).out;
        if (/User 0:[^\n]*suspended=true/.test(dump)) continue;
        todo.push(pkg);
      }
      return {
        steps: todo.map((p) => ({ kind: "cmd", cmd: `pm suspend --user 0 ${p}` })),
        restore: todo.map((p) => ({ op: "unsuspend", pkg: p })),
      };
    }
    case "notification_channels": {
      const all = await listChannels(sh, a.listCmd);
      const hit = all.filter(
        (c) =>
          c.importance > 0 &&
          !a.skipPackages.includes(c.pkg) &&
          a.matchName.some((k) => c.name.includes(k)) &&
          !a.neverMatch.some((k) => c.name.includes(k)),
      );
      return {
        steps: hit.map((ch) => ({ kind: "channel_off", ch })),
        restore: hit.map((ch) => ({ op: "channel_on", pkg: ch.pkg, channel: ch.id, name: ch.name })),
      };
    }
  }
}

export async function prepare(sh: Shell, pack: Pack, device: DeviceInfo, selections: Selection[], log: Log): Promise<{ backup: Backup; plan: PlannedRule[] }> {
  const chosen = new Map(selections.map((s) => [s.id, s]));
  const plan: PlannedRule[] = [];
  for (const rule of orderedRules(pack)) {
    const sel = chosen.get(rule.id);
    if (!sel) continue;
    const values = { ...defaultParams(rule), ...sel.params };
    for (const [k, v] of Object.entries(values)) {
      if (!paramChoices(rule, k, device.sdk).includes(v)) throw new Error(`${rule.title}：参数 ${v} 不可用`);
    }
    const steps: Step[] = [];
    let restore: RestoreOp[] = [];
    for (const a of rule.actions) {
      const r = await planAction(sh, a, values);
      steps.push(...r.steps);
      restore = [...r.restore.reverse(), ...restore];
    }
    log("info", `已备份：${rule.title}`);
    plan.push({ rule, values, steps, restore });
  }
  const backup: Backup = {
    format: "care-mode-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    pack: { name: pack.pack, version: pack.version },
    device,
    rules: plan.map((p) => ({ id: p.rule.id, title: p.rule.title, restore: p.restore })),
  };
  return { backup, plan };
}

// ---------- 执行 ----------

export type Outcome = "ok" | "partial" | "rolled_back" | "failed";

export async function execute(sh: Shell, plan: PlannedRule[], log: Log): Promise<Record<string, Outcome>> {
  const result: Record<string, Outcome> = {};
  for (const p of plan) {
    log("info", `正在执行：${p.rule.title}`);
    let failures = 0;
    try {
      for (const s of p.steps) {
        if (s.kind === "cmd") {
          try {
            const r = await sh.run(s.cmd, { timeoutMs: s.tolerateDisconnect ? 4000 : 15000 });
            if (r.code !== 0) {
              failures++;
              log("warn", `命令失败：${s.cmd}`);
            }
          } catch (e) {
            if (!s.tolerateDisconnect) throw e;
          }
        } else {
          const ok = await setChannelEnabled(sh, s.ch, false);
          if (ok) log("ok", `已关闭通知：${s.ch.pkg} · ${s.ch.name}`);
          else {
            failures++;
            log("warn", `没关掉，已跳过：${s.ch.pkg} · ${s.ch.name}`);
          }
        }
      }
    } catch (e) {
      log("error", `${p.rule.title} 出错：${(e as Error).message}，正在改回`);
      await runRestore(sh, p.restore, log);
      result[p.rule.id] = "failed";
      continue;
    }
    if (p.rule.verify) {
      const v = p.rule.verify;
      let ok = false;
      for (let i = 0; i <= v.retries && !ok; i++) {
        await sh.sleep(v.waitSeconds * 1000);
        ok = await dnsResolves(sh, v.host);
      }
      if (!ok) {
        log("warn", v.message);
        await runRestore(sh, p.restore, log);
        result[p.rule.id] = "rolled_back";
        continue;
      }
    }
    result[p.rule.id] = failures === 0 ? "ok" : "partial";
    log(failures === 0 ? "ok" : "warn", `${p.rule.title}：${failures === 0 ? "完成" : `完成，有 ${failures} 项跳过`}`);
  }
  return result;
}

// ---------- 还原 ----------

export function validateBackup(data: unknown): Backup {
  const b = data as Backup;
  if (!b || b.format !== "care-mode-backup" || b.version !== 1 || !Array.isArray(b.rules)) {
    throw new Error("这不是关怀模式的备份文件");
  }
  for (const r of b.rules) {
    for (const op of r.restore) {
      const bad = () => new Error(`备份文件内容不对（${r.title}），为了安全不执行`);
      switch (op.op) {
        case "setting":
          if (!NS.has(op.ns) || !KEY_RE.test(op.key) || (op.value !== null && typeof op.value !== "string")) throw bad();
          break;
        case "density":
          if (op.value !== null && !(Number.isInteger(op.value) && op.value >= 72 && op.value <= 1200)) throw bad();
          break;
        case "appop":
          if (!PKG_RE.test(op.pkg) || !OP_RE.test(op.name) || !MODES.has(op.mode)) throw bad();
          break;
        case "unsuspend":
          if (!PKG_RE.test(op.pkg)) throw bad();
          break;
        case "channel_on":
          if (!PKG_RE.test(op.pkg) || typeof op.channel !== "string") throw bad();
          break;
        default:
          throw bad();
      }
    }
  }
  return b;
}

function restoreCmd(op: Exclude<RestoreOp, { op: "channel_on" }>): string {
  switch (op.op) {
    case "setting":
      return op.value === null ? `settings delete ${op.ns} ${op.key}` : `settings put ${op.ns} ${op.key} ${shQuote(op.value)}`;
    case "density":
      return op.value === null ? "wm density reset" : `wm density ${op.value}`;
    case "appop":
      return `cmd appops set --user 0 ${op.pkg} ${op.name} ${op.mode}`;
    case "unsuspend":
      return `pm unsuspend --user 0 ${op.pkg}`;
  }
}

export async function runRestore(sh: Shell, ops: RestoreOp[], log: Log): Promise<number> {
  let failures = 0;
  for (const op of ops) {
    if (op.op === "channel_on") {
      const ok = await setChannelEnabled(sh, { pkg: op.pkg, id: op.channel, name: op.name, importance: 0 }, true);
      if (!ok) {
        failures++;
        log("warn", `通知没能自动打开，请手动打开：${op.pkg} · ${op.name}`);
      }
      continue;
    }
    const cmd = restoreCmd(op);
    if ((await sh.run(cmd)).code !== 0) {
      failures++;
      log("warn", `还原失败：${cmd}`);
    }
  }
  return failures;
}

/** 从备份文件整体还原：后执行的规则先还原。 */
export async function restoreBackup(sh: Shell, backup: Backup, log: Log): Promise<number> {
  let failures = 0;
  for (const r of [...backup.rules].reverse()) {
    log("info", `正在还原：${r.title}`);
    failures += await runRestore(sh, r.restore, log);
  }
  return failures;
}
