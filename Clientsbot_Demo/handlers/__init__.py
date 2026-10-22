"""Пакет с роутерами aiogram.

Порядок в списке = приоритет: сначала более специфичные роутеры,
потом общие (команды и прочее).
"""

from handlers import start, webapp_data

routers = [start.router, webapp_data.router]
