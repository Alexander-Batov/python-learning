"""Точка входа: Telegram-бот (long polling) + веб-сервер мини-аппа.

Оба компонента работают в одном event loop asyncio:
сначала поднимается aiohttp-сервер статики мини-аппа, затем запускается polling.
"""

import asyncio
import logging
from pathlib import Path

from aiohttp import web
from aiogram import Bot, Dispatcher

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
    """Собирает и запускает aiohttp-сервер статики мини-аппа."""
    app = web.Application()
    # Главная страница по корню
    app.router.add_get("/", index_handler)
    # Остальная статика (app.js, style.css и будущие файлы) — из папки webapp/
    app.router.add_static("/", WEBAPP_DIR, show_index=False)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", config.port)
    await site.start()
    logger.info("Веб-сервер мини-аппа запущен: http://localhost:%s", config.port)


async def main() -> None:
    bot = Bot(token=config.bot_token)
    dp = Dispatcher()

    for router in routers:
        dp.include_router(router)

    # TODO: подключить мидлвари (логирование, антиспам), инициализацию БД и т.п.

    # Сначала поднимаем веб-сервер мини-аппа, затем запускаем поллинг.
    # Если токен невалиден, polling упадёт с ошибкой авторизации Telegram —
    # веб-сервер к этому моменту уже работает.
    await run_webapp()
    logger.info("Запуск long polling...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен")
