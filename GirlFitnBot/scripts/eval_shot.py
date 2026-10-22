"""Скриншот после выполнения JS-выражения в странице (CDP).

Для подэкранов/шторок, которые не открываются глубокой ссылкой ?screen=:
сначала навигация, затем Runtime.evaluate (например,
"App.screens.profile.openSettings()"), затем съёмка.

Использование:
    python scripts/eval_shot.py <url> <out.png> <js> [width] [height] [wait_sec]
"""

import base64
import json
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, __file__.rsplit("\\", 1)[0] if "\\" in __file__ else ".")
from cdp_shot import CHROME, DEBUG_PORT, WS


def main() -> None:
    url, out, js = sys.argv[1], sys.argv[2], sys.argv[3]
    width = int(sys.argv[4]) if len(sys.argv) > 4 else 390
    height = int(sys.argv[5]) if len(sys.argv) > 5 else 1500
    wait_sec = float(sys.argv[6]) if len(sys.argv) > 6 else 3.0

    profile = __file__.rsplit("\\", 1)[0] + "\\..\\chrome-cdp-profile"
    import os
    profile = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "chrome-cdp-profile"))
    proc = subprocess.Popen([
        CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={profile}", f"--window-size={width},{height}",
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
        if not ws_url:
            raise RuntimeError("CDP: не найден целевой таб")

        ws = WS(ws_url)
        ws.call("Page.enable", {}, 1)
        ws.call("Network.enable", {}, 2)
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True}, 3)
        ws.call("Emulation.setDeviceMetricsOverride",
                {"width": width, "height": height, "deviceScaleFactor": 2,
                 "mobile": True}, 4)
        ws.call("Page.navigate", {"url": url}, 5)
        time.sleep(wait_sec + 2)  # загрузка + первый рендер
        res = ws.call("Runtime.evaluate",
                      {"expression": js, "awaitPromise": True,
                       "returnByValue": True}, 6)
        if "exceptionDetails" in res.get("result", {}):
            print("JS exception:", json.dumps(res["result"]["exceptionDetails"])[:400])
        else:
            print("JS result:", json.dumps(res.get("result", {}).get("result", {}).get("value")))
        time.sleep(wait_sec)
        shot = ws.call("Page.captureScreenshot", {"format": "png"}, 7)
        data = base64.b64decode(shot["result"]["data"])
        with open(out, "wb") as fh:
            fh.write(out and data)
        print(f"saved {out} ({len(data)} bytes)")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
