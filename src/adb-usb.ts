// 通过 WebUSB 连接手机（Tango ADB），对外只暴露 Shell 接口。

import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import type { Shell } from "./types";

export function webUsbSupported(): boolean {
  return AdbDaemonWebUsbDeviceManager.BROWSER !== undefined;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("命令超时")), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export class UsbShell implements Shell {
  constructor(private adb: Adb) {}

  get disconnected() {
    return this.adb.disconnected;
  }

  async run(cmd: string, opts: { timeoutMs?: number } = {}) {
    const timeout = opts.timeoutMs ?? 15000;
    const shell = this.adb.subprocess.shellProtocol;
    if (shell) {
      const r = await withTimeout(shell.spawnWaitText(cmd), timeout);
      return { out: r.stdout + r.stderr, code: r.exitCode };
    }
    // 不支持 shell 协议的老设备：自己在末尾打印退出码。
    const text = await withTimeout(this.adb.subprocess.noneProtocol.spawnWaitText(`${cmd}; echo __CARE_EXIT=$?`), timeout);
    const m = /__CARE_EXIT=(\d+)\s*$/.exec(text);
    return { out: m ? text.slice(0, m.index) : text, code: m ? Number(m[1]) : 0 };
  }

  sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  close() {
    return this.adb.close();
  }
}

/** 弹出浏览器的选择设备窗口并连接。用户取消返回 undefined。 */
export async function connectUsb(onWaitingForAuth: () => void): Promise<UsbShell | undefined> {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) throw new Error("这个浏览器不支持 USB 连接手机，请用电脑上的 Chrome 或 Edge。");
  const device = await manager.requestDevice();
  if (!device) return undefined;
  let connection;
  try {
    connection = await device.connect();
  } catch (e) {
    if (e instanceof AdbDaemonWebUsbDevice.DeviceBusyError) {
      throw new Error("手机被电脑上别的程序占用了。请关掉手机助手、豌豆荚、Android Studio 等软件（或在命令行运行 adb kill-server），再拔插一下数据线重试。");
    }
    throw e;
  }
  const authTimer = setTimeout(onWaitingForAuth, 1200);
  try {
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore: new AdbWebCredentialStore("老年机关怀模式"),
    });
    return new UsbShell(new Adb(transport));
  } finally {
    clearTimeout(authTimer);
  }
}
