"""Скриншоты через Chrome DevTools Protocol (минимальный WebSocket-клиент на stdlib).

--screenshot в headless Chrome/Edge в этом окружении зависает, поэтому
управляем браузером по CDP: навигация, ожидание загрузки, съёмка.

Использование:
    python scripts/cdp_shot.py <url> <out.png> [width] [height] [wait_sec]
"""

import base64
import hashlib
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DEBUG_PORT = 9333


class WS:
    """Минимальный клиент WebSocket (только то, что нужно для CDP)."""

    def __init__(self, url: str, timeout: int = 20):
        # ws://host:port/path
        rest = url.split("://", 1)[1]
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("WS handshake: соединение закрыто")
            resp += chunk
        if b"101" not in resp.split(b"\r\n", 1)[0]:
            raise ConnectionError(f"WS handshake: {resp[:120]}")
        self.buf = b""

    def _read_exact(self, n: int) -> bytes:
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("WS: соединение закрыто")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv_message(self) -> str:
        payload = b""
        while True:
            head = self._read_exact(2)
            b1, b2 = head[0], head[1]
            fin = b1 & 0x80
            opcode = b1 & 0x0F
            masked = b2 & 0x80
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._read_exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._read_exact(8))[0]
            mask = self._read_exact(4) if masked else None
            data = self._read_exact(length)
            if mask:
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            if opcode == 9:  # ping → pong
                self._send_frame(data, opcode=10)
                continue
            if opcode == 8:
                raise ConnectionError("WS: закрытие соединения")
            payload += data
            if fin:
                return payload.decode("utf-8", errors="replace")

    def _send_frame(self, data: bytes, opcode: int = 1) -> None:
        mask = os.urandom(4)
        header = bytearray([0x80 | opcode])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(header) + mask + masked)

    def send(self, obj: dict) -> None:
        self._send_frame(json.dumps(obj).encode())

    def call(self, method: str, params: dict, msg_id: int) -> dict:
        self.send({"id": msg_id, "method": method, "params": params})
        while True:
            msg = json.loads(self.recv_message())
            if msg.get("id") == msg_id:
                return msg


def main() -> None:
    url, out = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 390
    height = int(sys.argv[4]) if len(sys.argv) > 4 else 1500
    wait_sec = float(sys.argv[5]) if len(sys.argv) > 5 else 3.0

    profile = os.path.abspath("chrome-cdp-profile")
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
        # Кэш отключаем: иначе Chrome отдаёт старые JS/CSS из профиля
        ws.call("Network.enable", {}, 2)
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True}, 3)
        ws.call("Emulation.setDeviceMetricsOverride",
                {"width": width, "height": height, "deviceScaleFactor": 2,
                 "mobile": True}, 4)
        ws.call("Page.navigate", {"url": url}, 5)
        # ждём loadEventFired (максимум 25 сек), затем доигрываем анимации/данные
        deadline = time.time() + 25
        ws.sock.settimeout(max(1.0, deadline - time.time()))
        loaded = False
        while time.time() < deadline:
            try:
                msg = json.loads(ws.recv_message())
            except (socket.timeout, ConnectionError):
                break
            if msg.get("method") == "Page.loadEventFired":
                loaded = True
                break
        time.sleep(wait_sec)
        shot = ws.call("Page.captureScreenshot", {"format": "png"}, 4)
        data = base64.b64decode(shot["result"]["data"])
        with open(out, "wb") as fh:
            fh.write(data)
        print(f"saved {out} ({len(data)} bytes, load={loaded})")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
