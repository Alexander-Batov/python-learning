"""Распознавание речи через Vosk (офлайн, малая русская модель).

При первом запуске модель (~50 МБ) скачивается автоматически
в кэш Vosk, дальше работает без сети.
"""
from __future__ import annotations

import json
import logging

from vosk import KaldiRecognizer, Model, SetLogLevel

from .base import STTEngine

logger = logging.getLogger(__name__)


class VoskSTT(STTEngine):
    def __init__(self, sample_rate: int, lang: str = "ru") -> None:
        SetLogLevel(-1)
        logger.info("Загрузка модели Vosk (lang=%s)...", lang)
        self._model = Model(lang=lang)
        self._sample_rate = sample_rate

    def recognize(self, pcm: bytes) -> str:
        if not pcm:
            return ""
        recognizer = KaldiRecognizer(self._model, self._sample_rate)
        # Кормим по кускам ~1 секунде, чтобы не грузить один вызов
        chunk_size = self._sample_rate * 2  # байт int16 за одну секунду
        for i in range(0, len(pcm), chunk_size):
            recognizer.AcceptWaveform(pcm[i:i + chunk_size])
        result = json.loads(recognizer.FinalResult())
        return result.get("text", "").strip()
