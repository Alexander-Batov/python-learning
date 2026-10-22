"""Исполнение системных команд: громкость, программы, запуск Katya_Bot."""
from __future__ import annotations

import logging
import os
import subprocess

from config import Settings

from .parser import Command
from .registry import PROGRAMS

logger = logging.getLogger(__name__)

HELP_TEXT = (
    "Я умею: отвечать на вопросы, открывать программы — скажи «открой блокнот», "
    "«открой браузер». Управлять громкостью — «громкость пятьдесят», «тише», «громче». "
    "Запускать твоего бота — «запусти бота». "
    "Выход — «спасибо, всё»."
)

_bot_process: subprocess.Popen | None = None


def execute(command: Command, settings: Settings) -> str | None:
    """Выполняет команду и возвращает текст для озвучки (или None)."""
    match command.kind:
        case "volume":
            return _set_volume(int(command.value))
        case "volume_delta":
            return _change_volume(int(command.value))
        case "open":
            return _open_program(str(command.value))
        case "bot":
            return _launch_bot(settings)
        case "help":
            return HELP_TEXT
    return None


def _speakers():
    """Текущее устройство воспроизведения по умолчанию (pycaw)."""
    from pycaw.utils import AudioUtilities

    return AudioUtilities.GetSpeakers()


def _set_volume(level: int) -> str:
    speakers = _speakers()
    speakers.EndpointVolume.SetMute(0, None)
    speakers.volume_percent = level
    logger.info("Громкость установлена: %s%%", level)
    return f"Громкость {level} процентов."


def _change_volume(delta: int) -> str:
    speakers = _speakers()
    current = round(speakers.volume_percent)
    level = min(100, max(0, current + delta))
    speakers.EndpointVolume.SetMute(0, None)
    speakers.volume_percent = level
    logger.info("Громкость изменена: %s%% -> %s%%", current, level)
    if level == current and level in (0, 100):
        return f"Громкость уже на {level} процентов."
    direction = "громче" if delta > 0 else "тише"
    return f"Сделал {direction}. Сейчас {level} процентов."


def _open_program(name: str) -> str:
    path = PROGRAMS.get(name)
    if path is None:
        return f"Не знаю программу «{name}». Список есть в файле commands/registry.py."
    try:
        os.startfile(path)  # type: ignore[attr-defined]
    except Exception:
        logger.exception("Не удалось открыть: %s", path)
        return f"Не удалось открыть {name}."
    logger.info("Открываю: %s (%s)", name, path)
    return f"Открываю {name}."


def _launch_bot(settings: Settings) -> str:
    global _bot_process
    bot_py = settings.katya_bot_dir / "bot.py"
    if not bot_py.exists():
        return f"Не нашёл bot.py в папке {settings.katya_bot_dir}."
    if _bot_process is not None and _bot_process.poll() is None:
        return "Бот уже запущен."
    if not os.path.exists(settings.bot_python):
        return f"Не найден Python для бота: {settings.bot_python}."
    try:
        _bot_process = subprocess.Popen(
            [settings.bot_python, "bot.py"],
            cwd=str(settings.katya_bot_dir),
            creationflags=subprocess.CREATE_NEW_CONSOLE,  # отдельное окно консоли
        )
    except Exception:
        logger.exception("Не удалось запустить Katya_Bot")
        return "Не удалось запустить бота."
    logger.info("Katya_Bot запущен (pid=%s)", _bot_process.pid)
    return "Запускаю твоего бота."
