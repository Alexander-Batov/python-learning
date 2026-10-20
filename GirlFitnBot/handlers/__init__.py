"""Пакет с роутерами aiogram.

Порядок в списке = приоритет: сначала более специфичные роутеры,
потом общие (команды и прочее).
"""

from handlers import onboarding, start, webapp_data

routers = [onboarding.router, start.router, webapp_data.router]
