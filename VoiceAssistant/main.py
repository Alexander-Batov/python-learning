"""Голосовой ассистент для Windows. Запуск: python main.py"""
from __future__ import annotations

import logging
import sys

from assistant import Assistant
from config import Settings, load_settings
from llm import LLMClient
from stt import STTEngine, VoskSTT
from tts import EdgeTTSEngine, TTSEngine

logger = logging.getLogger(__name__)


def _build_stt(settings: Settings) -> STTEngine:
    if settings.stt_engine == "vosk":
        return VoskSTT(sample_rate=settings.sample_rate)
    raise ValueError(f"Неизвестный STT-движок: {settings.stt_engine}")


def _build_tts(settings: Settings) -> TTSEngine:
    if settings.tts_engine == "edge":
        return EdgeTTSEngine(voice=settings.tts_voice)
    raise ValueError(f"Неизвестный TTS-движок: {settings.tts_engine}")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    settings = load_settings()
    if "--check" in sys.argv:
        from check import run_check

        run_check(settings)
        return
    assistant = Assistant(
        settings=settings,
        stt=_build_stt(settings),
        tts=_build_tts(settings),
        llm=LLMClient(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            model=settings.llm_model,
        ),
    )
    try:
        assistant.run()
    except KeyboardInterrupt:
        logger.info("Остановлено пользователем (Ctrl+C)")


if __name__ == "__main__":
    main()
