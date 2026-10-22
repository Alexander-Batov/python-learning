"""Базовый интерфейс движка распознавания речи (STT).

Чтобы подключить другой движок, унаследуй класс от STTEngine
и реализуй recognize() — остальной код менять не придётся.
"""
from __future__ import annotations

from abc import ABC, abstractmethod


class STTEngine(ABC):
    @abstractmethod
    def recognize(self, pcm: bytes) -> str:
        """Распознать речь из PCM-аудио (int16, моно, sample_rate из конфига).

        Возвращает распознанный текст без знаков препинания (или пустую строку).
        """
