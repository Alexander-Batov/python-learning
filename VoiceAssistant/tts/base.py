"""Базовый интерфейс движка синтеза речи (TTS).

Чтобы подключить другой движок, унаследуй класс от TTSEngine
и реализуй speak() — остальной код менять не придётся.
"""
from __future__ import annotations

from abc import ABC, abstractmethod


class TTSEngine(ABC):
    @abstractmethod
    def speak(self, text: str) -> None:
        """Озвучить текст (блокирующий вызов, воспроизводит через динамики)."""
