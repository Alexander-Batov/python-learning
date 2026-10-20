"""Точка входа: Telegram-бот (long polling) + веб-сервер мини-аппа.

Оба компонента работают в одном event loop asyncio:
сначала поднимается aiohttp-сервер статики мини-аппа и API /api/*
(маршруты подключаются из api.py), затем запускается polling
и планировщик уведомлений (notify.py).
"""

import asyncio
import logging
from pathlib import Path

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramNetworkError, TelegramUnauthorizedError

import api
import db
import notify
from config import config
from handlers import routers

# Папка со статикой мини-аппа (лежит рядом с bot.py)
WEBAPP_DIR = Path(__file__).parent / "webapp"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def index_handler(request: web.Request) -> web.FileResponse:
    """Отдаёт главную страницу мини-аппа."""
    return web.FileResponse(WEBAPP_DIR / "index.html")


async def run_webapp() -> None:
    """Собирает и запускает aiohttp-сервер статики и API мини-аппа."""
    app = web.Application()
    # API — до статики, чтобы корень не перехватывал маршруты
    api.setup_routes(app)
    # Главная страница по корню
    app.router.add_get("/", index_handler)
    # Остальная статика (app.js, style.css, content.json, data/* и т.п.)
    app.router.add_static("/", WEBAPP_DIR, show_index=False)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", config.port)
    await site.start()
    logger.info("Веб-сервер мини-аппа запущен: http://localhost:%s", config.port)


async def main() -> None:
    db.init()

    bot = Bot(token=config.bot_token)
    dp = Dispatcher()

    for router in routers:
        dp.include_router(router)

    # Сначала поднимаем веб-сервер мини-аппа и планировщик, затем polling.
    # Если Telegram недоступен из сети (локально без VPN) или токен невалиден,
    # веб-сервер мини-аппа продолжает работать — polling просто остановлен.
    await run_webapp()
    notify_task = asyncio.create_task(notify.scheduler_loop(bot))
    logger.info("Запуск long polling...")
    try:
        await dp.start_polling(bot)
    except (TelegramNetworkError, TelegramUnauthorizedError) as exc:
        logger.error(
            "Polling недоступен (%s) — продолжаю работать как веб-сервер мини-аппа",
            exc,
        )
        await asyncio.Event().wait()
    finally:
        notify_task.cancel()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен")
