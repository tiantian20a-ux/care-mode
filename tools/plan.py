#!/usr/bin/env python3
"""校验规则包，并按一台模拟手机生成「备份 → 执行 → 校验 → 还原」的命令清单。

这里定义了每种 action 的语义，第 2 步的网页工具按同样的语义实现。

用法：
    python3 plan.py ../rules/common.json --device fake-devices/xiaomi-sdk34.json
    python3 plan.py ../rules/common.json --check      # 只校验格式
"""
import argparse
import json
import re
import sys

TIERS = {"recommended", "optional", "consent"}
ACTION_TYPES = {"setting", "wm_density", "appop_revoke_all", "suspend", "notification_channels", "ui_recipe", "package_network_off"}
SETTING_NS = {"system", "secure", "global"}
PKG_RE = re.compile(r"^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$")


def validate(pack):
    errors = []
    ids = set()
    for i, rule in enumerate(pack.get("rules", [])):
        where = f"rules[{i}] {rule.get('id', '?')}"
        for field in ("id", "title", "why", "tier", "actions"):
            if field not in rule:
                errors.append(f"{where}: 缺少 {field}")
        if rule.get("id") in ids:
            errors.append(f"{where}: id 重复")
        ids.add(rule.get("id"))
        if rule.get("tier") not in TIERS:
            errors.append(f"{where}: tier 只能是 {sorted(TIERS)}")
        if rule.get("tier") == "consent" and not rule.get("caution"):
            errors.append(f"{where}: consent 规则必须写 caution，告诉机主后果")
        params = rule.get("params", {})
        for name, p in params.items():
            if p["default"] not in p["choices"]:
                errors.append(f"{where}: 参数 {name} 的默认值不在 choices 里")
        for j, a in enumerate(rule.get("actions", [])):
            aw = f"{where}.actions[{j}]"
            t = a.get("type")
            if t not in ACTION_TYPES:
                errors.append(f"{aw}: 未知 type {t}")
            if t == "setting" and a.get("ns") not in SETTING_NS:
                errors.append(f"{aw}: ns 只能是 {sorted(SETTING_NS)}")
            if t == "suspend":
                for p in a["packages"]:
                    if not PKG_RE.match(p["pkg"]):
                        errors.append(f"{aw}: 包名不合法 {p['pkg']}")
            for ref in re.findall(r"\{\{(\w+)\}\}", json.dumps(a, ensure_ascii=False)):
                if ref not in params and ref not in ("pkg", "channel"):
                    errors.append(f"{aw}: 引用了未定义的参数 {ref}")
    last = [r.get("runLast", False) for r in pack.get("rules", [])]
    if True in last and last.index(True) != len(last) - last.count(True):
        errors.append("runLast 的规则必须排在最后")
    return errors


def fill(text, values):
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(values[m.group(1)]), text)


def param_values(rule, sdk):
    out = {}
    for name, p in rule.get("params", {}).items():
        choices = p.get("choicesMinSdk34", p["choices"]) if sdk >= 34 else p["choices"]
        assert p["default"] in choices
        out[name] = p["default"]
    return out


class Fake:
    """模拟手机：只回答规则需要读的东西。"""

    def __init__(self, d):
        self.d = d

    def setting(self, ns, key):
        return self.d.get("settings", {}).get(f"{ns}/{key}", "null")

    def installed(self, pkg):
        return pkg in self.d.get("packages", [])


def plan_action(a, values, dev):
    """返回 (备份记录, 执行命令, 还原命令)。还原命令按执行的倒序排列。"""
    t = a["type"]
    if t == "setting":
        ns, key, val = a["ns"], a["key"], fill(a["value"], values)
        prev = dev.setting(ns, key)
        backup = {f"{ns}/{key}": prev}
        apply = [f"settings put {ns} {key} {val}"]
        if a.get("noRestore"):
            restore = []
        elif prev == "null":
            restore = [f"settings delete {ns} {key}"]
        else:
            restore = [f"settings put {ns} {key} {prev}"]
        return backup, apply, restore
    if t == "wm_density":
        phys = dev.d["density"]["physical"]
        override = dev.d["density"].get("override")
        target = round(phys * float(fill(a["factor"], values)))
        backup = {"wm_density_override": override}
        restore = [f"wm density {override}"] if override else ["wm density reset"]
        return backup, [f"wm density {target}"], restore
    if t == "appop_revoke_all":
        op = a["op"]
        allowed = dev.d.get("appops", {}).get(op, [])
        backup = {f"appops/{op}/{a['from']}": allowed}
        apply = [f"cmd appops set --user 0 {p} {op} {a['to']}" for p in allowed]
        restore = [f"cmd appops set --user 0 {p} {op} {a['from']}" for p in allowed]
        return backup, apply, restore
    if t == "suspend":
        targets = [p["pkg"] for p in a["packages"] if not a.get("onlyIfInstalled") or dev.installed(p["pkg"])]
        already = set(dev.d.get("suspended", []))
        todo = [p for p in targets if p not in already]
        backup = {"suspended_by_us": todo}
        return backup, [f"pm suspend --user 0 {p}" for p in todo], [f"pm unsuspend --user 0 {p}" for p in todo]
    if t == "notification_channels":
        return {}, [f"# 界面自动化：先读 {a['listCmd']}，名字命中关键词的类别逐个打开设置页关掉"], ["# 界面自动化：把关掉的类别逐个打开"]
    raise ValueError(t)


def make_plan(pack, device):
    dev = Fake(device)
    sdk = int(device["sdk"])
    lines = [f"# 设备：{device['brand']} {device['model']}，Android SDK {sdk}"]
    if sdk < pack["appliesTo"]["minSdk"]:
        return lines + [f"# 不支持：需要 SDK {pack['appliesTo']['minSdk']} 以上"]
    backup_all, restore_all = {}, []
    for rule in pack["rules"]:
        if rule["tier"] != "recommended" and rule["id"] not in device.get("optIn", []):
            lines.append(f"\n## [跳过] {rule['title']}（{rule['tier']}，未勾选）")
            continue
        if sdk < rule.get("minSdk", 0):
            lines.append(f"\n## [跳过] {rule['title']}（需要 SDK {rule['minSdk']} 以上）")
            continue
        if "preflight.network" in rule.get("requires", []) and not device.get("online", True):
            lines.append(f"\n## [跳过] {rule['title']}（手机没网）")
            continue
        values = param_values(rule, sdk)
        lines.append(f"\n## {rule['title']}" + (f"  参数 {values}" if values else ""))
        if rule.get("executor") == "ui":
            lines.append("#   (由网页工具的界面自动化执行)")
        rule_restore = []
        for a in rule["actions"]:
            b, ap, rs = plan_action(a, values, dev)
            backup_all.update(b)
            lines += [f"  {c}" for c in ap] or ["  # 无需改动"]
            rule_restore = rs + rule_restore
        if "verify" in rule:
            v = rule["verify"]
            lines.append(f"  # 等 {v['waitSeconds']} 秒后校验 {v['check']}({v['host']})，失败则 {v['onFail']}")
        restore_all = rule_restore + restore_all
    lines.append("\n# ===== 备份内容（执行前存到电脑） =====")
    lines.append(json.dumps(backup_all, ensure_ascii=False, indent=2))
    lines.append("\n# ===== 一键还原（需重新打开 USB 调试） =====")
    lines += [f"  {c}" for c in restore_all]
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pack")
    ap.add_argument("--device")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    with open(args.pack, encoding="utf-8") as f:
        pack = json.load(f)
    errors = validate(pack)
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"OK：{pack['title']} v{pack['version']}，{len(pack['rules'])} 条规则")
    if args.device:
        with open(args.device, encoding="utf-8") as f:
            print("\n".join(make_plan(pack, json.load(f))))


if __name__ == "__main__":
    main()
