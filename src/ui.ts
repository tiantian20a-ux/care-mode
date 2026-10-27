// 界面自动化：读屏（uiautomator dump）、找字、翻页、关开关、关弹窗。
// 移植自 android-ad-cleaner 的 tool/fast.py（MIT），改成只用 adb shell，不需要往手机装 uiautomator2。
// 和原版的区别：每次读屏要 1～2 秒，所以少读屏、多用固定等待；不识别自绘开关（原版靠截图看颜色）。

import type { Shell } from "./types";

export interface Node {
  text: string;
  desc: string;
  rid: string;
  cls: string;
  pkg: string;
  checkable: boolean;
  checked: boolean;
  clickable: boolean;
  scrollable: boolean;
  visible: boolean;
  b: [number, number, number, number];
  parent?: Node;
  children: Node[];
}

const DISMISS = ["以后再说", "暂不更新", "暂不", "取消", "我知道了", "跳过", "禁止", "不再提示", "不同意"];
const CONFIRM = ["确定", "关闭", "仍要关闭", "确认关闭", "确认", "继续关闭", "关闭推荐", "仍然关闭"];
const PERMISSION_CONTROLLERS = new Set(["com.android.permissioncontroller", "com.google.android.permissioncontroller"]);
const STATES = new Set(["开", "关", "已开启", "已关闭", "开启", "关闭", "ON", "OFF"]);
const CLOSE_RE = /close|关闭|跳过|skip|cancel|dismiss|iv_x\b|btn_x\b/i;

// 「防止/限制广告跟踪」这类开关是反的：打开才是保护。
const NEG_PREFIX = /^(防止|限制|阻止|禁止|拒绝|不允许|屏蔽|关闭|停用|不接收|不显示|不推送|停止)/;
const AD_WORDS = /广告|跟踪|追踪|推荐|个性化|营销|资讯|热搜|热点|定向|画像/;
const TRACK_WORDS = /广告|跟踪|追踪/;

/** 开关该处的状态：false=关；true=开（保护类）；null=不碰。 */
export function wantState(title: string): boolean | null {
  if (NEG_PREFIX.test(title)) return AD_WORDS.test(title) ? true : null;
  return false;
}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+);/g, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&" : String.fromCharCode(Number(e.slice(1))),
  );

/** 解析 uiautomator dump 的 XML，保留父子关系。 */
export function parseTree(xml: string): Node[] {
  const all: Node[] = [];
  const stack: Node[] = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)(\/?)>|<\/node>/g)) {
    if (m[0] === "</node>") {
      stack.pop();
      continue;
    }
    const attrs = m[1];
    const a = (k: string) => unescapeXml(new RegExp(`\\b${k}="([^"]*)"`).exec(attrs)?.[1] ?? "");
    const bm = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(a("bounds"));
    const n: Node = {
      text: a("text"),
      desc: a("content-desc"),
      rid: a("resource-id"),
      cls: a("class"),
      pkg: a("package"),
      checkable: a("checkable") === "true",
      checked: a("checked") === "true",
      clickable: a("clickable") === "true",
      scrollable: a("scrollable") === "true",
      visible: a("visible-to-user") !== "false",
      b: bm ? [+bm[1], +bm[2], +bm[3], +bm[4]] : [0, 0, 0, 0],
      parent: stack[stack.length - 1],
      children: [],
    };
    n.parent?.children.push(n);
    all.push(n);
    if (m[2] !== "/") stack.push(n);
  }
  return all;
}

function* descendants(n: Node): Generator<Node> {
  for (const c of n.children) {
    yield c;
    yield* descendants(c);
  }
}

const firstLine = (s: string) => s.trim().split("\n", 1)[0];

export interface Switch {
  title: string;
  checked: boolean;
  x: number;
  y: number;
}

export type Say = (text: string) => void;

export class UiError extends Error {}

export class Ui {
  W = 1080;
  H = 2400;
  /** 本段已经没找到几次；>0 说明路径对不上，后面只看当前屏、不再翻页找。 */
  miss = 0;
  changed: { page: string; title: string; to: boolean }[] = [];

  constructor(private sh: Shell, private say: Say = () => {}) {}

  async init() {
    const { out } = await this.sh.run("wm size");
    const m = /Override size:\s*(\d+)x(\d+)/.exec(out) ?? /Physical size:\s*(\d+)x(\d+)/.exec(out);
    if (m) [this.W, this.H] = [+m[1], +m[2]];
    // 小米没开「USB 调试（安全设置）」时能读屏、点不动。
    const probe = await this.sh.run("input keyevent 0");
    if (/INJECT_EVENTS/.test(probe.out)) {
      throw new UiError("手机拒绝了电脑的点击。小米/红米需要在「开发者选项」里打开「USB 调试（安全设置）」（要插 SIM 卡并登录小米账号）。");
    }
  }

  sleep(ms: number) {
    return this.sh.sleep(ms);
  }

  run(cmd: string) {
    return this.sh.run(cmd);
  }

  log(text: string) {
    this.say(text);
  }

  // ---------- 读屏 ----------

  async tree(): Promise<Node[]> {
    for (let i = 0; i < 3; i++) {
      const { out } = await this.sh.run("uiautomator dump /sdcard/care_ui.xml >/dev/null 2>&1; cat /sdcard/care_ui.xml; rm -f /sdcard/care_ui.xml", {
        timeoutMs: 20000,
      });
      const nodes = parseTree(out);
      if (nodes.length) {
        const root = nodes.find((n) => !n.parent);
        // 横屏时 dump 的根节点比竖屏宽。
        if (root && root.b[2] > 0 && root.b[3] > 0) [this.W, this.H] = [root.b[2], root.b[3]];
        return nodes;
      }
      await this.sleep(500); // 页面在动画中时 dump 会失败
    }
    return [];
  }

  onScreen(n: Node): boolean {
    if (!n.visible) return false;
    const [l, t, r, b] = n.b;
    const cx = (l + r) / 2;
    const cy = (t + b) / 2;
    return r > l && b > t && cx >= 0 && cx < this.W && cy >= 0 && cy < this.H;
  }

  texts(nodes: Node[]): { text: string; n: Node }[] {
    return nodes
      .filter((n) => n.pkg !== "com.android.systemui" && this.onScreen(n))
      .map((n) => ({ text: (n.text || n.desc).trim(), n }))
      .filter((x) => x.text);
  }

  sig(nodes: Node[]) {
    return this.texts(nodes).map((x) => x.text).join("|");
  }

  async focus(): Promise<string> {
    const { out } = await this.sh.run("dumpsys window | grep -m1 mCurrentFocus");
    return / u0 (\S+)\}/.exec(out)?.[1] ?? "";
  }

  async focusPkg() {
    return (await this.focus()).split("/", 1)[0];
  }

  async locked(): Promise<boolean> {
    const { out } = await this.sh.run("dumpsys window | grep -m1 isKeyguardShowing");
    return /isKeyguardShowing[=:]\s*true/.test(out);
  }

  /** 开关和它所在行的标题。 */
  switches(nodes: Node[]): Switch[] {
    const out: Switch[] = [];
    for (const n of nodes) {
      if (!this.onScreen(n) || n.cls.includes("RadioButton") || !n.checkable) continue;
      if (!/Switch|CheckBox|ToggleButton|Compound/.test(n.cls) && !n.clickable) continue;
      const [l, t, r, b] = n.b;
      const cy = Math.round((t + b) / 2);
      let label = firstLine(n.text || n.desc);
      if (STATES.has(label)) label = "";
      let title = "";
      let p: Node | undefined = n;
      for (let i = 0; i < 6 && p; i++) {
        const many = [...descendants(p)].filter((x) => x.cls.includes("Switch") && !x.cls.includes("Switcher") && this.onScreen(x)).length > 1;
        if (label && p !== n && many) {
          title = label;
          break;
        }
        const cand = [...descendants(p)]
          .filter((x) => x !== n && this.onScreen(x))
          .map((x) => ({ x, tx: firstLine(x.text || x.desc) }))
          .filter(({ tx }) => tx && !STATES.has(tx));
        if (cand.length) {
          const [, pt, , pb] = p.b;
          if (pb - pt <= Math.max(this.H * 0.18, (b - t) * 3)) {
            // 开关所在这一行：最上面那段字是标题，下面是说明。
            title = cand.sort((a, c) => a.x.b[1] - c.x.b[1] || a.x.b[0] - c.x.b[0])[0].tx;
          } else {
            // 找到的是整个列表：取竖直方向离开关最近的文字。
            const dist = (x: Node) => (x.b[1] <= cy && cy <= x.b[3] ? 0 : Math.min(Math.abs(x.b[1] - cy), Math.abs(x.b[3] - cy)));
            const near = cand.sort((a, c) => dist(a.x) - dist(c.x) || a.x.b[1] - c.x.b[1])[0];
            if (dist(near.x) <= Math.max(60, b - t)) title = near.tx;
          }
          break;
        }
        p = p.parent;
      }
      out.push({ title: title || label, checked: n.checked, x: Math.round((l + r) / 2), y: cy });
    }
    // 同一行有「整行」和「开关」两个 checkable：留最靠右的。
    const rows: Switch[] = [];
    for (const sw of out.sort((a, b) => a.y - b.y)) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - sw.y) < 30) {
        if (sw.x > last.x) rows[rows.length - 1] = sw.title ? sw : { ...sw, title: last.title };
      } else rows.push(sw);
    }
    return rows;
  }

  find(nodes: Node[], text: string, exact = false, edge: false | true | "tab" = false): [number, number] | undefined {
    for (const { text: t, n } of this.texts(nodes)) {
      if (exact ? t !== text : !t.includes(text)) continue;
      const [l, tp, r, b] = n.b;
      if (b <= tp || r <= l) continue;
      const cy = Math.round((tp + b) / 2);
      const cx = Math.round((l + r) / 2);
      if (cy < this.H * 0.92 || edge === "tab") return [cx, cy];
      if (edge && tp < this.H * 0.975) return [cx, tp + 15];
    }
    return undefined;
  }

  // ---------- 动作 ----------

  async click(x: number, y: number) {
    if (!(x >= 0 && x < this.W && y >= 0 && y < this.H)) throw new UiError("点击坐标在屏幕外，未操作");
    // 有的 App 吞 input tap，用 80 毫秒的短按代替。
    const { out } = await this.sh.run(`input swipe ${x} ${y} ${x} ${y} 80`);
    if (/INJECT_EVENTS/.test(out)) throw new UiError("手机拒绝了电脑的点击（小米需打开「USB 调试（安全设置）」）");
  }

  async scroll(frac = 0.45, up = false) {
    const x = this.W > 2000 ? Math.floor((this.W * 7) / 10) : Math.floor(this.W / 2);
    frac = Math.min(frac, 0.58);
    let y1 = Math.floor(this.H * 0.8);
    let y2 = Math.floor(this.H * (0.8 - frac));
    if (up) [y1, y2] = [y2, y1];
    await this.sh.run(`input swipe ${x} ${y1} ${x} ${y2} 600`);
    await this.sleep(400);
  }

  /** 翻一页。没有可滚动的列表、或翻完没出现新文字（到底了）返回 false。 */
  async scrollMore(nodes: Node[]): Promise<boolean> {
    if (!nodes.some((n) => n.scrollable && this.onScreen(n))) return false;
    const focus = await this.focus();
    const before = new Set(this.texts(nodes).map((x) => x.text));
    await this.scroll();
    if ((await this.focus()) !== focus) throw new UiError("翻页离开了当前页面，停止本段以免操作其他 App");
    const after = this.texts(await this.tree()).map((x) => x.text);
    return after.some((t) => !before.has(t));
  }

  async top(n = 4) {
    for (let i = 0; i < n; i++) {
      const nodes = await this.tree();
      if (!nodes.some((x) => x.scrollable && this.onScreen(x))) return;
      const before = new Set(this.texts(nodes).map((x) => x.text));
      await this.scroll(0.58, true);
      const after = this.texts(await this.tree()).map((x) => x.text);
      if (after.every((t) => before.has(t))) return;
    }
  }

  async back(n = 1) {
    for (let i = 0; i < n; i++) {
      await this.sh.run("input keyevent BACK");
      await this.sleep(700);
    }
  }

  /** 关掉挡路的更新/推荐/权限弹窗。只点拒绝类按钮，不替机主同意任何东西。 */
  async dismiss(nodes?: Node[]): Promise<string | null> {
    nodes ??= await this.tree();
    if (nodes.some((n) => PERMISSION_CONTROLLERS.has(n.pkg)) && PERMISSION_CONTROLLERS.has(await this.focusPkg())) {
      for (const n of nodes) {
        if (PERMISSION_CONTROLLERS.has(n.pkg) && n.cls.includes("Button") && ["拒绝", "不允许", "Deny", "Don't allow"].includes(n.text) && this.onScreen(n)) {
          await this.clickNode(n);
          this.say("已拒绝权限申请，没有授予权限");
          return "拒绝权限";
        }
      }
      return null;
    }
    const inList = (n: Node) => {
      for (let p = n.parent; p; p = p.parent) if (p.scrollable) return true;
      return false;
    };
    for (const n of nodes) {
      if (!n.clickable || n.pkg === "com.android.systemui") continue;
      const key = `${n.desc} ${n.rid}`;
      if (CLOSE_RE.test(key) && !n.text.trim() && !inList(n)) {
        const [l, t, r, b] = n.b;
        if (r - l > 0 && r - l < this.W * 0.3 && b - t > 0 && b - t < this.H * 0.12) {
          await this.clickNode(n);
          this.say("关掉了一个弹窗（✕）");
          return "✕";
        }
      }
    }
    const tx = this.texts(nodes);
    if (tx.length > 16) return null;
    // 带开关或滚动列表的是正常页面，不能仅凭「取消」两个字当弹窗。
    if (nodes.some((n) => n.checkable || n.scrollable)) return null;
    for (const w of DISMISS) {
      const hit = tx.find((x) => x.text === w);
      if (hit) {
        await this.clickNode(hit.n);
        this.say(`关掉了一个弹窗（${w}）`);
        return w;
      }
    }
    return null;
  }

  private async clickNode(n: Node, wait = 600) {
    const [l, t, r, b] = n.b;
    await this.click(Math.round((l + r) / 2), Math.round((t + b) / 2));
    await this.sleep(wait);
  }

  /** 开关后弹出确认框就点确认。只认 Button，不点开关旁边的「关闭」状态字。 */
  async confirm(): Promise<string | null> {
    await this.sleep(300);
    const nodes = await this.tree();
    for (const c of CONFIRM) {
      const n = nodes.find((x) => x.text.trim() === c && x.cls.includes("Button") && x.b[2] > x.b[0] && x.b[3] > x.b[1]);
      if (n) {
        await this.clickNode(n, 400);
        return c;
      }
    }
    return null;
  }

  /** 找到文字就点；往下翻着找，到底没有就回顶部再找一遍。scrolls=0 只看当前屏（底栏、按钮）。 */
  async tap(text: string, opts: { exact?: boolean; scrolls?: number } = {}): Promise<boolean> {
    const exact = opts.exact ?? true;
    const scrolls = opts.scrolls ?? 6;
    const hit = async (xy: [number, number]) => {
      await this.click(...xy);
      await this.sleep(1000);
      return true;
    };
    if (scrolls === 0 || this.miss) {
      for (let i = 0; i < (scrolls === 0 ? 3 : 1); i++) {
        const nodes = await this.tree();
        const xy = this.find(nodes, text, exact, "tab");
        if (xy) {
          this.miss = 0;
          return hit(xy);
        }
        if (!(await this.dismiss(nodes))) await this.sleep(500);
      }
      this.miss++;
      this.say(`没找到「${text}」`);
      return false;
    }
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i <= scrolls; i++) {
        let nodes = await this.tree();
        let xy = this.find(nodes, text, exact);
        if (!xy && (await this.dismiss(nodes))) {
          nodes = await this.tree();
          xy = this.find(nodes, text, exact);
        }
        if (xy) return hit(xy);
        if (i < scrolls && !(await this.scrollMore(nodes))) {
          const last = this.find(await this.tree(), text, exact, true);
          if (last) return hit(last);
          break;
        }
      }
      if (round === 0) await this.top(scrolls + 2);
    }
    this.miss++;
    this.say(`没找到「${text}」`);
    return false;
  }

  /** 可选入口：有就点，没有也不算走丢。 */
  async maybe(text: string, scrolls = 6): Promise<boolean> {
    this.miss = 0;
    const ok = await this.tap(text, { exact: true, scrolls });
    this.miss = 0;
    return ok;
  }

  async tapAny(...names: string[]): Promise<boolean> {
    for (const n of names) if (await this.maybe(n)) return true;
    return false;
  }

  /** 点 text，直到 expect 出现（被弹窗吞掉就再点）。 */
  async go(text: string, expect: string, tries = 3): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      await this.tap(text, { scrolls: 0 });
      for (let j = 0; j < 3; j++) {
        const nodes = await this.tree();
        if (this.find(nodes, expect) || this.find(nodes, expect, false, "tab")) return true;
        if (!(await this.dismiss(nodes))) await this.sleep(300);
      }
    }
    this.say(`点「${text}」后没出现「${expect}」`);
    return false;
  }

  /**
   * 当前列表：把开着的广告类开关关掉。keep=标题含这些词的不动；only=只处理含这些词的。
   * 「限制广告跟踪」这类保护开关会被打开。改完重新读屏核对，没拨过去的再点一次。
   */
  async off(opts: { only?: string[]; keep?: string[]; page?: string; maxScreens?: number } = {}): Promise<number> {
    const { only, keep = [], page = "", maxScreens = 20 } = opts;
    let nodes = await this.tree();
    for (let i = 0; i < (this.miss ? 1 : 4) && !this.switches(nodes).length; i++) {
      await this.sleep(500);
      nodes = await this.tree();
    }
    const start = await this.focus();
    let done = 0;
    let slow = false;
    let checked = 0;
    for (let s = 0; s < maxScreens; s++) {
      const targets: (Switch & { want: boolean })[] = [];
      for (const sw of this.switches(nodes)) {
        if (!sw.title) continue;
        const want = wantState(sw.title);
        if (want === null || keep.some((k) => sw.title.includes(k))) continue;
        if (only && !only.some((k) => sw.title.includes(k)) && !(want && TRACK_WORDS.test(sw.title))) continue;
        checked++;
        if (sw.checked === want || sw.y < this.H * 0.08 || sw.y > this.H * 0.985) continue;
        targets.push({ ...sw, want });
      }
      for (const [i, t] of targets.entries()) {
        await this.click(t.x, t.y);
        if (i === 0 || slow) {
          if (await this.confirm()) slow = true;
          else if ((await this.focus()) !== start) {
            this.say(`页面变了，停下（${page}）`);
            await this.back();
            return done;
          }
        } else await this.sleep(150);
      }
      if (targets.length) {
        await this.sleep(400);
        await this.confirm();
        const wrong = async () => {
          const now = this.switches(await this.tree());
          return targets.filter((t) => now.find((x) => x.title === t.title)?.checked !== t.want).map((t) => ({ t, now }));
        };
        let still = await wrong();
        if (still.length) {
          await this.sleep(800);
          for (const { t, now } of still) {
            const cur = now.find((x) => x.title === t.title);
            if (cur && cur.checked !== t.want) {
              await this.click(cur.x, cur.y);
              await this.confirm();
            }
          }
          still = await wrong();
        }
        for (const t of targets) {
          if (still.some((x) => x.t === t)) this.say(`${t.want ? "打不开" : "关不掉"}：${t.title}`);
          else {
            this.say(`${t.want ? "已打开（保护类开关）" : "已关闭"}：${page ? page + " · " : ""}${t.title}`);
            this.changed.push({ page, title: t.title, to: t.want });
            done++;
          }
        }
      }
      if (!(await this.scrollMore(nodes))) break;
      nodes = await this.tree();
    }
    if (page && !checked) this.say(`${page}：没找到要改的开关`);
    return done;
  }

  /** 拉起 App，等它到前台，顺手关掉启动弹窗。 */
  async start(pkg: string, activity?: string, foreground?: string): Promise<void> {
    this.miss = 0;
    const r = activity
      ? await this.sh.run(`am start -f 0x10008000 -n ${pkg}/${activity}`)
      : (await this.sh.run(`am force-stop ${pkg}`), await this.sh.run(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`));
    if (r.code !== 0 || /Error|Exception|No activities found|monkey aborted/i.test(r.out)) {
      if (!(await this.sh.run(`pm path ${pkg}`)).out.includes("package:")) throw new UiError(`手机上没有装这个应用（${pkg}），跳过`);
      throw new UiError(`打不开 ${pkg}`);
    }
    const expected = foreground ?? pkg;
    for (let i = 0; ; i++) {
      const cur = await this.focusPkg();
      if (cur === expected) break;
      if (PERMISSION_CONTROLLERS.has(cur)) await this.dismiss();
      if (i >= 10) throw new UiError(`${pkg} 没有打开到前台，跳过`);
      await this.sleep(500);
    }
    for (let i = 0; i < 3; i++) {
      const nodes = await this.tree();
      if ((await this.focusPkg()) !== expected && !PERMISSION_CONTROLLERS.has(await this.focusPkg())) {
        throw new UiError(`${pkg} 启动后跳到了别的应用，停止本段`);
      }
      if (this.texts(nodes).length && !(await this.dismiss(nodes))) break;
      await this.sleep(600);
    }
  }

  /** 右上角没有文字的「设置」齿轮；找不到就试「设置」字样和「更多」菜单。 */
  async gear(toolbarOnly = false): Promise<boolean> {
    let nodes = await this.tree();
    for (const n of nodes) {
      const d = `${n.desc}${n.rid}${n.text}`.toLowerCase();
      const [l, t, r, b] = n.b;
      const icon = n.cls.includes("ImageView") && r - l < this.W * 0.25 && b - t < this.H * 0.15;
      if ((d.includes("设置") || d.includes("setting")) && !d.includes("更多") && !d.includes("more") && (n.clickable || icon) && this.onScreen(n) && (!toolbarOnly || b < this.H * 0.23)) {
        await this.clickNode(n, 1000);
        return true;
      }
    }
    if (!toolbarOnly && this.find(nodes, "设置", true, "tab")) return this.tap("设置", { scrolls: 0 });
    for (const n of nodes) {
      const key = `${n.desc} ${n.rid}`.toLowerCase();
      if (/更多|more|menu/.test(key) && n.clickable && this.onScreen(n) && n.b[3] < this.H * 0.22) {
        await this.clickNode(n, 600);
        nodes = await this.tree();
        if (this.find(nodes, "设置", true, "tab")) return this.tap("设置", { scrolls: 0 });
        break;
      }
    }
    return false;
  }
}
