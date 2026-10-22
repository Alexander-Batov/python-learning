"""Загрузка и валидация настроек из переменных окружения (.env)."""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    """Конфигурация проекта.

    Токен намеренно скрыт в repr, чтобы случайно не попасть в логи.
    """

    bot_token: str
    webapp_url: str
    port: int

    def __repr__(self) -> str:
        return (
            f"Config(bot_token='***', "
            f"webapp_url={self.webapp_url!r}, port={self.port})"
        )


def load_config() -> Config:
    """Читает переменные окружения и собирает Config.

    При проблемах бросает ValueError с понятным сообщением —
    чтобы на старте была ясная ошибка, а не traceback где-то в глубине.
    """
    bot_token = os.getenv("BOT_TOKEN", "").strip()
    if not bot_token:
        raise ValueError(
            "BOT_TOKEN не задан. Скопируйте .env.example в .env "
            "и вставьте токен от @BotFather."
        )

    webapp_url = os.getenv("WEBAPP_URL", "").strip()
    if not webapp_url:
        raise ValueError(
            "WEBAPP_URL не задан. Укажите публичный HTTPS-URL мини-аппа "
            "(для локальных тестов — URL ngrok-туннеля, см. README.md)."
        )

    port_raw = os.getenv("PORT", "8080").strip()
    try:
        port = int(port_raw)
    except ValueError:
        raise ValueError(
            f"PORT должен быть целым числом, получено: {port_raw!r}"
        ) from None

    return Config(bot_token=bot_token, webapp_url=webapp_url, port=port)


# Глобальный объект конфигурации, импортируется из других модулей.
try:
    config = load_config()
except ValueError as exc:
    # Понятное сообщение при старте вместо длинного traceback
    raise SystemExit(f"Ошибка конфигурации: {exc}") from exc
