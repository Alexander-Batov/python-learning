"""Проверка горизонтального переполнения экранов на 360/390/430 px.

Один запуск Chrome, навигация по ?screen=X, измерение scrollWidth документа.
Критерий: document.scrollingElement.scrollWidth <= window.innerWidth.
Список элементов шире viewport — справочно (скролл-карусели намеренно шире).

Использование:
    python scripts/check_overflow.py "<initData-строка, URL-encoded>"
"""

import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_shot import WS, CHROME, DEBUG_PORT  # noqa: E402

SCREENS = ['today', 'cycle', 'activity', 'nutrition', 'habits', 'profile']
WIDTHS = [360, 390, 430]

EVAL = r"""
(() => {
  const de = document.documentElement;
  const wide = [];
  document.querySelectorAll('.screen:not(.hidden) *').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (['SCRIPT', 'STYLE'].includes(e.tagName)) return;
    if (e.closest('.nt-phases-scroll, .gf-chips')) return; // намеренные скролл-карусели
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      wide.push((e.className && e.className.toString ? e.className.toString() : e.tagName)
        .split(' ')[0] + ':' + Math.round(r.right));
    }
  });
  // Реальный критерий: страница физически не скроллится горизонтально
  window.scrollTo(1e6, 0);
  const sl = window.scrollX;
  window.scrollTo(0, 0);
  return JSON.stringify({
    inner: window.innerWidth,
    doc: de.scrollWidth,
    scrollX: sl,
    wide: wide.slice(0, 6),
  });
})()
"""


def main() -> None:
    init = sys.argv[1]
    profile = os.path.abspath("chrome-cdp-profile")
    proc = subprocess.Popen([
        CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={profile}", "--window-size=430,1200",
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failures = 0
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
        if not ws_url:
            raise RuntimeError("CDP: не найден целевой таб")

        ws = WS(ws_url, timeout=30)
        ws.call("Page.enable", {}, 1)
        ws.call("Network.enable", {}, 2)
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True}, 3)

        msg_id = 10
        for width in WIDTHS:
            ws.call("Emulation.setDeviceMetricsOverride",
                    {"width": width, "height": 1200, "deviceScaleFactor": 1,
                     "mobile": True}, msg_id)
            msg_id += 1
            for screen in SCREENS:
                url = ("http://localhost:8080/?initData=" + init
                       + "&screen=" + screen)
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
                data = json.loads(res["result"]["result"]["value"])
                ok = data["scrollX"] == 0 and not data["wide"]
                if not ok:
                    failures += 1
                status = "OK " if ok else "FAIL"
                print(f"{status} {width}px {screen:9s} scrollX={data['scrollX']} "
                      f"doc={data['doc']} inner={data['inner']} wide={data['wide']}")
        print(f"\nИтог: {failures} переполнений")
        sys.exit(1 if failures else 0)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
