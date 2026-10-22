"""Отладка: элементы, вылезающие за viewport на 360px."""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_shot import WS, CHROME, DEBUG_PORT

EVAL = r"""
(() => {
  const bad = [];
  document.querySelectorAll('.screen:not(.hidden) *').forEach((e) => {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(e.tagName)) return;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      const chain = [];
      let n = e;
      while (n && n.className && chain.length < 3) {
        chain.push((n.className.toString ? n.className.toString() : '').split(' ').slice(0, 2).join('.'));
        n = n.parentElement;
      }
      bad.push(`${e.tagName}.${chain.join(' < ')} right=${Math.round(r.right)} left=${Math.round(r.left)} w=${Math.round(r.width)}`);
    }
  });
  return JSON.stringify(bad.slice(0, 10));
})()
"""


def main() -> None:
    init = sys.argv[1]
    profile = os.path.abspath("chrome-cdp-profile")
    proc = subprocess.Popen([
        CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={profile}", "--window-size=360,1200",
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(50):
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{DEBUG_PORT}/json/list", timeout=2
                ) as resp:
                    targets = json.loads(resp.read().decode())
                pages = [t for t in targets if t.get("type") == "page"]
                if pages:
                    ws_url = pages[0]["webSocketDebuggerUrl"]
                    break
            except Exception:
                time.sleep(0.3)
        ws = WS(ws_url, timeout=30)
        ws.call("Page.enable", {}, 1)
        ws.call("Network.enable", {}, 2)
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True}, 3)
        ws.call("Emulation.setDeviceMetricsOverride",
                {"width": 360, "height": 1200, "deviceScaleFactor": 1,
                 "mobile": True}, 4)
        msg_id = 10
        for screen in ['today', 'activity', 'nutrition']:
            url = "http://localhost:8080/?initData=" + init + "&screen=" + screen
            ws.call("Page.navigate", {"url": url}, msg_id)
            msg_id += 1
            deadline = time.time() + 20
            ws.sock.settimeout(5)
            while time.time() < deadline:
                try:
                    m = json.loads(ws.recv_message())
                except (socket.timeout, ConnectionError):
                    continue
                if m.get("method") == "Page.loadEventFired":
                    break
            time.sleep(1.2)
            res = ws.call("Runtime.evaluate",
                          {"expression": EVAL, "returnByValue": True}, msg_id)
            msg_id += 1
            print(f"--- {screen}:")
            for item in json.loads(res["result"]["result"]["value"]):
                print("   ", item)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
