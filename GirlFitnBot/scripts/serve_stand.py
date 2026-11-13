"""Локальный стенд для визуальных проверок мини-аппа вне Telegram.

Поднимает статику webapp/ + все /api/*-эндпоинты на отдельной тестовой БД,
подменяет api._user_id фиксированным пользователем (initData не проверяется),
на все ответы ставит Cache-Control: no-store.

Использование (из корня проекта):
    python scripts/serve_stand.py [port]     # по умолчанию 8099

Затем скриншоты:
    python scripts/cdp_shot.py "http://localhost:8099/?initData=dev&screen=nutrition" shot.png
"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Тестовая БД рядом со скриптом, продовую users.db не трогаем
os.environ.setdefault("DB_PATH", str(ROOT / "scripts" / "stand_test.db"))

from aiohttp import web  # noqa: E402

import api  # noqa: E402
import db  # noqa: E402

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
TEST_USER = 1


async def _fixed_user_id(request: web.Request) -> int:
    return TEST_USER


@web.middleware
async def no_store(request: web.Request, handler):
    resp = await handler(request)
    resp.headers["Cache-Control"] = "no-store"
    return resp


def main() -> None:
    db.init()
    # День цикла 11 при длине 28 — фолликулярная фаза, как в спецификации стенда
    cycle_start = (date.today() - timedelta(days=10)).isoformat()
    db.save_user(
        TEST_USER,
        cycle_start=cycle_start,
        cycle_length=28,
        name="Светлана",
        period_length=5,
    )

    api._user_id = _fixed_user_id

    app = web.Application(middlewares=[no_store])
    api.setup_routes(app)
    app.router.add_get(
        "/", lambda r: web.FileResponse(ROOT / "webapp" / "index.html"))
    app.router.add_static("/", ROOT / "webapp", show_index=False)

    print(f"Стенд: http://localhost:{PORT}/?initData=dev  (user_id={TEST_USER}, "
          f"cycle_start={cycle_start}, БД={os.environ['DB_PATH']})")
    web.run_app(app, host="127.0.0.1", port=PORT, print=None)


if __name__ == "__main__":
    main()
