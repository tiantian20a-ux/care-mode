import "./style.css";
import commonJson from "../rules/common.json";
import xiaomiJson from "../rules/xiaomi.json";
import oppoJson from "../rules/oppo.json";
import vivoJson from "../rules/vivo.json";
import honorJson from "../rules/honor.json";
import type { Backup, Pack, Rule, Shell } from "./types";
import {
  brandPackFor,
  mergePacks,
  defaultParams,
  execute,
  orderedRules,
  paramChoices,
  preflight,
  prepare,
  restoreBackup,
  skipReason,
  validateBackup,
  type Log,
  type Outcome,
  type PlannedRule,
  type PreflightResult,
} from "./engine";
import { FakePhone, demoState } from "./fake-phone";
import { brandPhone } from "./fake-brands";

const common = commonJson as unknown as Pack;
const brandPacks = [xiaomiJson, oppoJson, vivoJson, honorJson] as unknown as Pack[];
/** 连上手机后换成「通用 + 这个品牌」合并后的规则包。 */
let pack: Pack = common;
let brand: Pack | undefined;
const app = document.getElementById("app")!;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let shell: Shell | undefined;
let demo = false;
/** 演示用哪个品牌的模拟手机：?demo=oppo / vivo / honor，默认小米。 */
let demoBrand = "";

// ---------- 小工具 ----------

function render(html: string) {
  app.innerHTML = html;
  window.scrollTo({ top: 0 });
}

function on(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener("click", fn);
}

function logView(): { log: Log; el: HTMLElement } {
  const el = document.createElement("ul");
  el.className = "log";
  const log: Log = (level, text) => {
    const li = document.createElement("li");
    li.className = level;
    li.textContent = text;
    el.appendChild(li);
    el.scrollTop = el.scrollHeight;
  };
  return { log, el };
}

function download(backup: Backup) {
  // 文件名只用英文和数字，避免部分浏览器把中文文件名下载成 "download"。
  const name = `care-mode-backup-${backup.device.brand}-${backup.device.model}-${backup.createdAt.slice(0, 10)}`.replace(/[^\w.-]+/g, "_") + ".json";
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function rememberBackup(backup: Backup) {
  try {
    localStorage.setItem("care-mode:last-backup", JSON.stringify(backup));
  } catch {
    // 只是方便功能，存不了也没关系
  }
}

function lastBackup(): Backup | undefined {
  try {
    const raw = localStorage.getItem("care-mode:last-backup");
    return raw ? validateBackup(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

async function getShell(onAuth: () => void): Promise<Shell | undefined> {
  if (demo) {
    if (demoBrand === "oppo" || demoBrand === "vivo" || demoBrand === "honor") {
      const { state, ui } = brandPhone(demoBrand);
      return new FakePhone(state, 30, ui);
    }
    return new FakePhone(demoState(), 30);
  }
  const { connectUsb } = await import("./adb-usb");
  return connectUsb(onAuth);
}

function usbAvailable(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

// ---------- 首页 ----------

function home() {
  const noUsb = !usbAvailable();
  render(`
    <h1>把长辈的手机设成关怀模式</h1>
    <p class="muted">用数据线把手机连到这台电脑，几分钟内自动完成：拦广告、关营销通知、调大字体、防止乱装应用。改之前会先备份，随时能还原。</p>
    ${noUsb ? `<div class="note bad">这个浏览器不支持用 USB 连接手机。请在<b>电脑</b>上用 <b>Chrome</b> 或 <b>Edge</b> 打开本页。你仍然可以先看演示。</div>` : ""}
    ${demo ? `<div class="note info">现在是<b>演示模式</b>：用一台模拟手机走完整流程，不会连接真手机。</div>` : ""}
    <div class="btns">
      <button class="primary" id="start" ${noUsb && !demo ? "disabled" : ""}>开始设置</button>
      <button id="restore" ${noUsb && !demo ? "disabled" : ""}>从备份还原</button>
    </div>
    ${demo ? `<button class="link" id="exit-demo">退出演示</button>` : `<button class="link" id="demo">先看演示（不用连手机）</button>`}
  `);
  on("start", guide);
  on("restore", restorePick);
  on("demo", () => ((demo = true), home()));
  on("exit-demo", () => ((demo = false), home()));
}

// ---------- 准备手机 ----------

function guide() {
  render(`
    <h1>第一步：打开手机的 USB 调试</h1>
    <p class="muted">这是安卓自带的功能，用完后工具会自动帮你关掉。</p>
    <div class="card">
      <ol class="steps">
        <li>打开手机「设置」→「关于手机」（小米叫「我的设备」→「全部参数」，OPPO/一加叫「关于本机」→「版本信息」，vivo 叫「系统管理」→「版本信息」）。</li>
        <li>找到「版本号」（小米是「OS 版本」），<b>连续点 7 下</b>，直到提示「已进入开发者模式」。可能要输锁屏密码。</li>
        <li>回到设置，搜索「开发者选项」，打开它，再打开里面的 <b>USB 调试</b>。</li>
        <li><b>小米/红米</b>还要打开「USB 调试（安全设置）」，需要登录小米账号并插 SIM 卡。</li>
        <li>用数据线连上电脑。手机弹出「USB 用途」选「仅充电」或「传输文件」都可以。</li>
      </ol>
    </div>
    <div class="note warn">如果电脑上开着手机助手、豌豆荚、Android Studio 之类的软件，请先关掉，否则会连不上。</div>
    <div class="btns">
      <button class="primary" id="connect">连接手机</button>
      <button id="back">返回</button>
    </div>
    <p id="status" class="muted"></p>
  `);
  on("back", home);
  on("connect", connect);
}

async function connect() {
  const status = document.getElementById("status")!;
  const btn = document.getElementById("connect") as HTMLButtonElement;
  btn.disabled = true;
  status.textContent = demo ? "正在连接模拟手机……" : "请在浏览器弹出的窗口里选中你的手机，然后点「连接」。";
  try {
    shell = await getShell(() => {
      status.innerHTML = "<b>请看手机屏幕</b>：弹出「允许 USB 调试吗？」时，勾选「一律允许」并点「允许」。";
    });
    if (!shell) {
      status.textContent = "没有选中手机。如果列表里没有你的手机，请确认 USB 调试已打开，并换一根能传数据的线。";
      btn.disabled = false;
      return;
    }
    status.textContent = "已连接，正在检查手机……";
    const pf = await preflight(shell, common);
    brand = brandPackFor(pf.device, brandPacks);
    pack = mergePacks(common, brand);
    review(pf);
  } catch (e) {
    status.innerHTML = `<span style="color:var(--bad)">连接失败：${esc((e as Error).message)}</span>`;
    btn.disabled = false;
  }
}

// ---------- 选择要做的事 ----------

function ruleRow(rule: Rule, pf: PreflightResult): string {
  const skip = skipReason(rule, { sdk: pf.device.sdk, online: pf.online, inputAllowed: pf.inputAllowed });
  const checked = !skip && rule.tier === "recommended";
  const badge = rule.tier === "consent" ? `<span class="badge consent">需机主同意</span>` : rule.tier === "recommended" ? `<span class="badge">推荐</span>` : "";
  const params = Object.entries(rule.params ?? {})
    .map(([name, p]) => {
      const opts = paramChoices(rule, name, pf.device.sdk)
        .map((v) => `<option value="${esc(v)}" ${v === p.default ? "selected" : ""}>${esc(p.labels?.[v] ?? v)}</option>`)
        .join("");
      return `<label class="param">选项：<select data-rule="${rule.id}" data-param="${name}">${opts}</select></label>`;
    })
    .join("");
  return `
    <div class="rule ${skip ? "disabled" : ""}">
      <input type="checkbox" id="r-${rule.id}" data-id="${rule.id}" ${checked ? "checked" : ""} ${skip ? "disabled" : ""} />
      <label for="r-${rule.id}" class="title">${esc(rule.title)}${badge}</label>
      <div class="why">${esc(rule.why)}${skip ? `（${esc(skip)}，已跳过）` : ""}</div>
      ${rule.caution && !skip ? `<div class="caution">${esc(rule.caution)}</div>` : ""}
      ${params && !skip ? params : ""}
      ${rule.tier === "consent" && !skip ? `<label class="consent-box why"><input type="checkbox" data-consent="${rule.id}" /> 机主已经知道并同意这一项</label>` : ""}
    </div>`;
}

function review(pf: PreflightResult) {
  const abort = pf.problems.find((p) => p.level === "abort");
  const d = pf.device;
  render(`
    <h1>第二步：选择要做的设置</h1>
    <div class="card">
      <dl class="kv">
        <dt>手机</dt><dd>${esc(d.brand)} ${esc(d.model)}</dd>
        <dt>安卓版本</dt><dd>${esc(d.release)}（SDK ${d.sdk}）</dd>
        <dt>网络</dt><dd>${pf.online ? "正常" : "没联网"}</dd>
      </dl>
    </div>
    ${pf.problems.map((p) => `<div class="note ${p.level === "abort" ? "bad" : "warn"}">${esc(p.message)}</div>`).join("")}
    ${abort ? `<div class="btns"><button id="back">返回</button></div>` : `
      <h2>通用设置（所有安卓手机）</h2>
      <div class="card">${orderedRules(pack).filter((r) => !r.group && !r.runLast).map((r) => ruleRow(r, pf)).join("")}</div>
      ${brand ? `<h2>${esc(brand.title)}</h2>
      ${brand.credits ? `<p class="muted">${esc(brand.credits)}</p>` : ""}
      <div class="card">${orderedRules(pack).filter((r) => r.group).map((r) => ruleRow(r, pf)).join("")}</div>`
        : `<div class="note info">「${esc(d.brand)}」的专属去广告规则还在做，这次先做通用设置。目前已支持：小米 / 红米 / POCO、OPPO / 一加 / realme、vivo / iQOO、荣耀。</div>`}
      <h2>收尾</h2>
      <div class="card">${orderedRules(pack).filter((r) => r.runLast).map((r) => ruleRow(r, pf)).join("")}</div>
      <div class="note info">下一步会先读取手机当前的设置，生成备份文件下载到电脑。<b>请保存好这个文件</b>，以后还原要用。</div>
      <div class="btns"><button class="primary" id="go">备份并继续</button><button id="back">返回</button></div>
      <p id="status" class="muted"></p>`}
  `);
  on("back", home);
  on("go", () => startBackup(pf));
}

function collectSelections() {
  const sel: { id: string; params: Record<string, string> }[] = [];
  for (const box of app.querySelectorAll<HTMLInputElement>("input[data-id]")) {
    if (!box.checked || box.disabled) continue;
    const rule = pack.rules.find((r) => r.id === box.dataset.id)!;
    if (rule.tier === "consent" && !app.querySelector<HTMLInputElement>(`input[data-consent="${rule.id}"]`)?.checked) {
      throw new Error(`「${rule.title}」需要机主同意。请勾选下面的确认框，或者取消这一项。`);
    }
    const params = defaultParams(rule);
    for (const s of app.querySelectorAll<HTMLSelectElement>(`select[data-rule="${rule.id}"]`)) params[s.dataset.param!] = s.value;
    sel.push({ id: rule.id, params });
  }
  return sel;
}

// ---------- 备份 ----------

async function startBackup(pf: PreflightResult) {
  const status = document.getElementById("status")!;
  let selections;
  try {
    selections = collectSelections();
  } catch (e) {
    status.innerHTML = `<span style="color:var(--warn)">${esc((e as Error).message)}</span>`;
    return;
  }
  if (!selections.length) {
    status.textContent = "还没有选任何一项。";
    return;
  }
  (document.getElementById("go") as HTMLButtonElement).disabled = true;
  status.textContent = "正在读取手机当前设置……";
  try {
    const { backup, plan } = await prepare(shell!, pack, pf.device, selections, () => {});
    rememberBackup(backup);
    download(backup);
    confirmBackup(backup, plan);
  } catch (e) {
    status.innerHTML = `<span style="color:var(--bad)">备份失败，没有改动手机：${esc((e as Error).message)}</span>`;
  }
}

function confirmBackup(backup: Backup, plan: PlannedRule[]) {
  const devOff = plan.some((p) => p.rule.runLast);
  render(`
    <h1>第三步：确认备份已保存</h1>
    <div class="card">
      <p>备份文件已经开始下载，文件名以 <b>care-mode-backup</b> 开头，一般在电脑的「下载」文件夹里。</p>
      <p class="muted">没看到的话可以 <button class="link" id="again">再下载一次</button>。</p>
    </div>
    <div class="card">
      <p><b>将要执行 ${plan.length} 项：</b></p>
      <ul>${plan.map((p) => `<li>${esc(p.rule.title)}</li>`).join("")}</ul>
    </div>
    ${devOff ? `<div class="note warn">最后会关闭开发者选项，电脑和手机会断开。这是正常的。</div>` : ""}
    <div class="note warn">执行过程中请让手机<b>保持解锁、亮屏</b>，不要拔线，也不要操作手机。</div>
    <label class="consent-box" style="color:inherit"><input type="checkbox" id="saved" /> 我已经保存好备份文件</label>
    <div class="btns"><button class="primary" id="run" disabled>开始执行</button><button id="cancel">取消，不改了</button></div>
  `);
  on("again", () => download(backup));
  const saved = document.getElementById("saved") as HTMLInputElement;
  saved.addEventListener("change", () => ((document.getElementById("run") as HTMLButtonElement).disabled = !saved.checked));
  on("cancel", home);
  on("run", () => run(plan, backup));
}

// ---------- 执行 ----------

async function run(plan: PlannedRule[], backup: Backup) {
  const uiCount = plan.filter((p) => p.rule.executor === "ui").length;
  render(`<h1>正在设置，请不要拔线</h1><p class="muted" id="status">大约需要 ${uiCount > 2 ? "5 到 15" : "1 到 3"} 分钟。手机屏幕会自己动，这是工具在点设置，请不要碰它。</p><div class="card" id="logbox"></div>`);
  const { log, el } = logView();
  document.getElementById("logbox")!.appendChild(el);
  let result: Record<string, Outcome>;
  try {
    result = await execute(shell!, plan, log);
  } catch (e) {
    log("error", `意外中断：${(e as Error).message}`);
    document.getElementById("status")!.innerHTML = `出错了。已经改了的设置可以用备份文件还原。<button class="link" id="home">回到首页</button>`;
    on("home", home);
    return;
  }
  // 界面配方改了哪些应用内开关，执行后才知道，已经补进备份的还原清单里。
  rememberBackup(backup);
  done(plan, result, el, backup);
}

function done(plan: PlannedRule[], result: Record<string, Outcome>, logEl: HTMLElement, backup: Backup) {
  const manual = backup.rules.flatMap((r) => r.restore).filter((o) => o.op === "manual");
  const label: Record<Outcome, string> = { ok: "✓ 完成", partial: "! 部分完成", rolled_back: "↺ 已自动改回", failed: "✗ 没做成，已改回" };
  render(`
    <h1>设置完成</h1>
    <div class="card"><ul class="result-list">${plan.map((p) => `<li>${label[result[p.rule.id]]}　${esc(p.rule.title)}</li>`).join("")}</ul></div>
    ${result["developer-off"] ? `<div class="note info">开发者选项已关闭，现在可以拔掉数据线了。以后要还原，需要重新打开 USB 调试，再点首页的「从备份还原」。</div>` : ""}
    ${manual.length ? `<div class="card">
      <p><b>改了 ${manual.length} 个应用里的开关。</b>这些没法自动还原，备份文件里已经记下了手动还原的方法。请<b>再下载一次备份</b>，替换掉刚才那份。</p>
      <div class="btns" style="margin-top:8px"><button class="primary" id="dl-full">下载完整备份</button></div>
      <details><summary>查看改了哪些开关，以及以后怎么手动还原</summary><ul>${manual.map((o) => `<li>${esc(o.op === "manual" ? o.text : "")}</li>`).join("")}</ul></details>
    </div>` : ""}
    <details class="card"><summary>查看详细记录</summary><div id="logbox"></div></details>
    <div class="btns"><button id="home">回到首页</button></div>
  `);
  document.getElementById("logbox")!.appendChild(logEl);
  on("dl-full", () => download(backup));
  on("home", home);
}

// ---------- 还原 ----------

function restorePick() {
  const last = lastBackup();
  render(`
    <h1>从备份还原</h1>
    <p class="muted">选择之前保存的备份文件，工具会把手机改回设置前的样子。手机需要先打开 USB 调试并连上电脑。</p>
    <div class="card">
      <input type="file" id="file" accept=".json,application/json" />
      ${last ? `<p class="muted" style="margin-top:12px">或者使用这台电脑上次的备份：${esc(last.device.brand)} ${esc(last.device.model)}，${esc(new Date(last.createdAt).toLocaleString())} <button class="link" id="use-last">用这个</button></p>` : ""}
    </div>
    <p id="status" class="muted"></p>
    <div class="btns"><button id="back">返回</button></div>
  `);
  on("back", home);
  on("use-last", () => last && restoreConfirm(last));
  document.getElementById("file")!.addEventListener("change", async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      restoreConfirm(validateBackup(JSON.parse(await f.text())));
    } catch (e) {
      document.getElementById("status")!.innerHTML = `<span style="color:var(--bad)">${esc((e as Error).message)}</span>`;
    }
  });
}

function restoreConfirm(backup: Backup) {
  render(`
    <h1>确认还原</h1>
    <div class="card">
      <dl class="kv">
        <dt>备份的手机</dt><dd>${esc(backup.device.brand)} ${esc(backup.device.model)}</dd>
        <dt>备份时间</dt><dd>${esc(new Date(backup.createdAt).toLocaleString())}</dd>
      </dl>
      <p style="margin-top:12px"><b>会还原：</b></p>
      <ul>${backup.rules.filter((r) => r.restore.length).map((r) => `<li>${esc(r.title)}</li>`).join("")}</ul>
    </div>
    <div class="note warn">请让手机保持解锁、亮屏。</div>
    <div class="btns"><button class="primary" id="go">连接手机并还原</button><button id="back">返回</button></div>
    <p id="status" class="muted"></p>
  `);
  on("back", restorePick);
  on("go", async () => {
    const status = document.getElementById("status")!;
    (document.getElementById("go") as HTMLButtonElement).disabled = true;
    try {
      shell = await getShell(() => (status.innerHTML = "<b>请看手机屏幕</b>，点「允许 USB 调试」。"));
      if (!shell) {
        status.textContent = "没有选中手机。";
        (document.getElementById("go") as HTMLButtonElement).disabled = false;
        return;
      }
      const model = (await shell.run("getprop ro.product.model")).out.trim();
      if (!demo && model !== backup.device.model && !confirm(`连接的手机是「${model}」，和备份里的「${backup.device.model}」不一样。仍然要还原吗？`)) {
        status.textContent = "已取消。";
        return;
      }
      render(`<h1>正在还原</h1><div class="card" id="logbox"></div>`);
      const { log, el } = logView();
      document.getElementById("logbox")!.appendChild(el);
      const failures = await restoreBackup(shell, backup, log);
      log(failures ? "warn" : "ok", failures ? `还原完成，有 ${failures} 项要手动处理（见上面）。` : "全部还原完成。");
      app.insertAdjacentHTML("beforeend", `<div class="note info">手机已还原。如果不再需要，可以在设置里关掉开发者选项。</div><div class="btns"><button id="home">回到首页</button></div>`);
      on("home", home);
    } catch (e) {
      status.innerHTML = `<span style="color:var(--bad)">还原失败：${esc((e as Error).message)}</span>`;
    }
  });
}

const query = new URLSearchParams(location.search);
demo = query.has("demo");
demoBrand = (query.get("demo") ?? "").toLowerCase();
home();
