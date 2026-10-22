"""Загрузка настроек ассистента из .env и переменных окружения."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Корень проекта — папка, где лежит этот файл
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"


def _get_str(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    return value if value else default


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value else default


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value else default


@dataclass(frozen=True)
class Settings:
    # LLM (OpenAI-совместимый API)
    llm_api_key: str | None
    llm_base_url: str | None
    llm_model: str

    # Движки (чтобы сменить STT/TTS — поменяй значение и добавь класс)
    stt_engine: str
    tts_engine: str

    # Wake word
    wake_word: str
    wake_threshold: float

    # TTS
    tts_voice: str

    # Аудио
    sample_rate: int
    silence_rms: int        # порог тишины (RMS int16) для конца фразы
    silence_seconds: float  # сколько секунд тишины считать концом фразы
    max_phrase_seconds: float

    # Фразы ассистента
    ready_phrase: str
    goodbye_phrase: str

    # Запуск Katya_Bot
    katya_bot_dir: Path
    bot_python: str

    @property
    def block_size(self) -> int:
        """Размер чанка микрофона: 80 мс (окно openWakeWord = 1280 сэмплов на 16 кГц)."""
        return int(self.sample_rate * 0.08)


def load_settings() -> Settings:
    load_dotenv(ENV_PATH)
    return Settings(
        llm_api_key=_get_str("OPENAI_API_KEY"),
        llm_base_url=_get_str("OPENAI_BASE_URL"),
        llm_model=_get_str("LLM_MODEL", "gpt-4o-mini"),
        stt_engine=_get_str("STT_ENGINE", "vosk"),
        tts_engine=_get_str("TTS_ENGINE", "edge"),
        wake_word=_get_str("WAKE_WORD", "alexa"),
        wake_threshold=_get_float("WAKE_THRESHOLD", 0.5),
        tts_voice=_get_str("TTS_VOICE", "ru-RU-SvetlanaNeural"),
        sample_rate=_get_int("SAMPLE_RATE", 16000),
        silence_rms=_get_int("SILENCE_RMS", 500),
        silence_seconds=_get_float("SILENCE_SECONDS", 1.2),
        max_phrase_seconds=_get_float("MAX_PHRASE_SECONDS", 15),
        ready_phrase="Слушаю.",
        goodbye_phrase="Пожалуйста! Выключаюсь.",
        katya_bot_dir=Path(_get_str("KATYA_BOT_DIR", "E:/Projects/Katya_Bot")),
        bot_python=_get_str("BOT_PYTHON", "E:/Projects/venv/Scripts/python.exe"),
    )
