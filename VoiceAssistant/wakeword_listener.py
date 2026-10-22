"""Детектор wake word на основе openWakeWord.

Пакет openWakeWord идёт с готовыми моделями (alexa, hey_jarvis и др.).
Детектору скармливаются чанки микрофона по 80 мс (1280 сэмплов на 16 кГц);
после срабатывания держит паузу (cooldown), чтобы эхо из динамиков
не активировало ассистента повторно.
"""
from __future__ import annotations

import logging
import time

import numpy as np

logger = logging.getLogger(__name__)


class WakeWordDetector:
    def __init__(
        self,
        wake_word: str,
        threshold: float,
        sample_rate: int = 16000,
        cooldown_seconds: float = 2.0,
    ) -> None:
        from openwakeword.model import Model  # тяжёлый импорт — делаем лениво
        from openwakeword.utils import download_models

        logger.info("Загрузка модели wake word '%s'...", wake_word)
        # При первом запуске скачивает модель и вспомогательные модели (если их нет)
        download_models([f"{wake_word}_v0.1"])
        # onnxruntime вместо tflite: openwakeword 0.6 иначе требует tflite_runtime
        self._model = Model(wakeword_models=[wake_word], inference_framework="onnx")
        self._wake_word = wake_word
        self._threshold = threshold
        self._cooldown = cooldown_seconds
        self._last_trigger = 0.0

    @property
    def wake_word(self) -> str:
        return self._wake_word

    def process(self, chunk: np.ndarray) -> bool:
        """Принимает чанк int16 и возвращает True, если услышан wake word."""
        if time.monotonic() - self._last_trigger < self._cooldown:
            return False
        pcm = np.ascontiguousarray(chunk, dtype=np.int16)
        scores = self._model.predict(pcm)
        score = scores.get(self._wake_word, 0.0)
        if score >= self._threshold:
            self._last_trigger = time.monotonic()
            return True
        return False
